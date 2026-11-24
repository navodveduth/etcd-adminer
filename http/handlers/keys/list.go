package keys

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	"github.com/srimaln91/etcd-adminer/internal/keyspace"
)

const defaultPageSize = 100
const maxPageSize = 1000

func (jh *Handler) ListKeys(w http.ResponseWriter, r *http.Request) {
	meta, ok := request.Meta(r.Context())
	if !ok {
		response.WriteError(w, http.StatusInternalServerError, "internal_error", "request metadata missing")
		return
	}
	query := r.URL.Query()
	limit := defaultPageSize
	if query.Has("limit") {
		parsed, err := strconv.Atoi(query.Get("limit"))
		if err != nil || parsed < 1 || parsed > maxPageSize {
			response.WriteError(w, http.StatusBadRequest, "invalid_limit", "limit must be between 1 and 1000")
			return
		}
		limit = parsed
	}
	prefix := query.Get("prefix")
	if len(prefix) > 8192 {
		response.WriteError(w, http.StatusBadRequest, "invalid_prefix", "prefix exceeds 8192 bytes")
		return
	}
	cursor := keyspace.Cursor{Backend: meta.Backend.Name(), User: meta.User, Prefix: prefix, Limit: limit, Expires: time.Now().Add(10 * time.Minute).Unix()}
	if token := query.Get("cursor"); token != "" {
		decoded, err := jh.Signer.Decode(token, meta.Pass, cursor)
		if err != nil {
			response.WriteError(w, http.StatusBadRequest, "invalid_cursor", "cursor expired or does not match this query; restart the listing")
			return
		}
		cursor = decoded
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	client, err := meta.Backend.NewClient(meta.User, meta.Pass)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	defer jh.CloseEtcdClient(client)
	if _, err := client.Authenticate(ctx, meta.User, meta.Pass); err != nil {
		response.WriteRPCError(w, err)
		return
	}
	ranges, err := keyspace.ReadableRanges(ctx, client.Auth, meta.User)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	page, err := keyspace.ReadPage(ctx, client.KV, keyspace.IntersectPrefix(ranges, prefix), string(cursor.Last), cursor.Revision, limit)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	output := response.KeyPage{Items: make([]response.KeySummary, 0, len(page.Kvs)), Revision: strconv.FormatInt(cursor.Revision, 10), HasMore: page.More}
	if page.Header != nil && cursor.Revision == 0 {
		cursor.Revision = page.Header.Revision
		output.Revision = strconv.FormatInt(cursor.Revision, 10)
	}
	for _, item := range page.Kvs {
		key, encoding := response.DisplayBytes(item.Key)
		output.Items = append(output.Items, response.KeySummary{Key: key, KeyEncoding: encoding, ModRevision: strconv.FormatInt(item.ModRevision, 10)})
	}
	if page.More {
		cursor.Last = page.Kvs[len(page.Kvs)-1].Key
		output.NextCursor, err = jh.Signer.Encode(cursor, meta.Pass)
		if err != nil {
			response.WriteError(w, http.StatusRequestEntityTooLarge, "cursor_too_large", "last key exceeds the cursor size budget; use a narrower prefix")
			return
		}
	}
	response.WriteJSON(w, output)
}

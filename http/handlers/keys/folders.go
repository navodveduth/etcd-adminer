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

func (jh *Handler) ListFolder(w http.ResponseWriter, r *http.Request) {
	meta, ok := request.Meta(r.Context())
	if !ok {
		response.WriteError(w, http.StatusInternalServerError, "internal_error", "request metadata missing")
		return
	}
	query := r.URL.Query()
	limit := 100
	if query.Has("limit") {
		parsed, err := strconv.Atoi(query.Get("limit"))
		if err != nil || parsed < 1 || parsed > 200 {
			response.WriteError(w, http.StatusBadRequest, "invalid_limit", "folder limit must be between 1 and 200")
			return
		}
		limit = parsed
	}
	prefix := query.Get("prefix")
	if len(prefix) > 8192 {
		response.WriteError(w, http.StatusBadRequest, "invalid_prefix", "prefix exceeds 8192 bytes")
		return
	}
	cursor := keyspace.Cursor{Purpose: "folder-v1", Backend: meta.Backend.Name(), User: meta.User, Prefix: prefix, Limit: limit, Expires: time.Now().Add(10 * time.Minute).Unix()}
	if token := query.Get("cursor"); token != "" {
		decoded, err := jh.Signer.Decode(token, meta.Pass, cursor)
		if err != nil {
			response.WriteError(w, http.StatusBadRequest, "invalid_cursor", "cursor expired or does not match this folder; refresh the folder")
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
	page, err := keyspace.ReadFolder(ctx, client.KV, keyspace.IntersectPrefix(ranges, prefix), prefix, string(cursor.Last), cursor.Revision, limit)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	type entry struct {
		Key         string `json:"key"`
		KeyEncoding string `json:"keyEncoding"`
		IsDirectory bool   `json:"isDirectory"`
	}
	output := struct {
		Items      []entry `json:"items"`
		Revision   string  `json:"revision"`
		HasMore    bool    `json:"hasMore"`
		NextCursor string  `json:"nextCursor,omitempty"`
	}{Items: make([]entry, 0, len(page.Items)), Revision: strconv.FormatInt(page.Revision, 10), HasMore: page.More}
	for _, item := range page.Items {
		key, encoding := response.DisplayBytes([]byte(item.Key))
		output.Items = append(output.Items, entry{key, encoding, item.Directory})
	}
	if page.More {
		cursor.Last, cursor.Revision = []byte(page.Next), page.Revision
		output.NextCursor, err = jh.Signer.Encode(cursor, meta.Pass)
		if err != nil {
			response.WriteError(w, http.StatusRequestEntityTooLarge, "cursor_too_large", "folder exceeds cursor size budget; use a narrower prefix")
			return
		}
	}
	response.WriteJSON(w, output)
}

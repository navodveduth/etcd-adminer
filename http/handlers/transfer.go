package handlers

import (
	"encoding/base64"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	"github.com/srimaln91/etcd-adminer/internal/transfer"
	clientv3 "go.etcd.io/etcd/client/v3"
)

func (jh *GenericHandler) TransferBatch(w http.ResponseWriter, r *http.Request) {
	var batch transfer.Batch
	if err := request.DecodeJSON(w, r, &batch); err != nil {
		response.WriteError(w, http.StatusBadRequest, "invalid_batch", "provide a valid bounded JSON batch")
		return
	}
	if err := transfer.Validate(batch); err != nil {
		response.WriteError(w, http.StatusBadRequest, "invalid_batch", err.Error())
		return
	}
	if !batch.DryRun && batch.Confirmation != strings.ToUpper(batch.Operation)+" "+strconv.Itoa(len(batch.Records)) {
		response.WriteError(w, http.StatusBadRequest, "confirmation_required", "type IMPORT or DELETE followed by the exact record count")
		return
	}
	client, ctx, cleanup, ok := jh.requestClient(w, r, false)
	if !ok {
		return
	}
	defer cleanup()
	result, err := transfer.Execute(ctx, client.KV, batch)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	if !batch.DryRun && !result.Applied {
		response.WriteError(w, http.StatusConflict, "batch_conflict", "a key changed since preview; no keys in this batch were changed; preview again")
		return
	}
	writeJSON(w, result)
}

func (jh *GenericHandler) ExportPage(w http.ResponseWriter, r *http.Request) {
	client, ctx, cleanup, ok := jh.requestClient(w, r, false)
	if !ok {
		return
	}
	defer cleanup()
	meta := r.Context().Value(META_KEY).(request.RequestMeta)
	prefix := r.URL.Query().Get("prefix")
	if len(prefix) > 8192 {
		response.WriteError(w, http.StatusBadRequest, "invalid_prefix", "prefix exceeds 8192 bytes")
		return
	}
	// Purpose-separate export cursors from key-browser cursors.
	cursor := keyCursor{Purpose: "export-v1", Backend: meta.Backend.Name(), User: meta.User, Prefix: prefix, Limit: 20, Expires: time.Now().Add(10 * time.Minute).Unix()}
	if token := r.URL.Query().Get("cursor"); token != "" {
		decoded, err := jh.decodeCursor(token, meta.Pass, cursor)
		if err != nil {
			response.WriteError(w, http.StatusBadRequest, "invalid_cursor", "export cursor expired or changed; restart export")
			return
		}
		cursor = decoded
	}
	ranges, err := readableRanges(ctx, client.Auth, meta.User)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	page, err := readKeyPage(ctx, client.KV, intersectPrefix(ranges, prefix), string(cursor.Last), cursor.Revision, 20)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	if cursor.Revision == 0 && page.Header != nil {
		cursor.Revision = page.Header.Revision
	}
	items := make([]transfer.Record, 0, len(page.Kvs))
	more := page.More
	size := 0
	for _, item := range page.Kvs {
		value, err := client.Get(ctx, string(item.Key), clientv3.WithRev(cursor.Revision))
		if err != nil {
			response.WriteRPCError(w, err)
			return
		}
		if len(value.Kvs) != 1 {
			response.WriteError(w, http.StatusConflict, "export_changed", "snapshot key unavailable; restart export")
			return
		}
		if len(value.Kvs[0].Value) > transfer.MaxValueBytes {
			response.WriteError(w, http.StatusRequestEntityTooLarge, "value_too_large", "export supports values up to 128 KiB; narrow the prefix or use etcd tooling")
			return
		}
		record := transfer.Record{KeyBase64: base64.StdEncoding.EncodeToString(item.Key), ValueBase64: base64.StdEncoding.EncodeToString(value.Kvs[0].Value)}
		size += len(record.KeyBase64) + len(record.ValueBase64)
		if size > 1024*1024 && len(items) > 0 {
			more = true
			break
		}
		items = append(items, record)
		cursor.Last = item.Key
	}
	var next string
	if more {
		next, err = jh.encodeCursor(cursor, meta.Pass)
		if err != nil {
			response.WriteError(w, http.StatusRequestEntityTooLarge, "cursor_too_large", "export key exceeds cursor budget")
			return
		}
	}
	writeJSON(w, struct {
		Version    int               `json:"version"`
		Revision   string            `json:"revision"`
		Records    []transfer.Record `json:"records"`
		NextCursor string            `json:"nextCursor,omitempty"`
		HasMore    bool              `json:"hasMore"`
	}{1, strconv.FormatInt(cursor.Revision, 10), items, next, more})
}

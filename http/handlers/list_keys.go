package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	clientv3 "go.etcd.io/etcd/client/v3"
)

const defaultPageSize = 100
const maxPageSize = 1000
const maxCursorBytes = 64 * 1024

type keyCursor struct {
	Purpose  string `json:"purpose,omitempty"`
	Backend  string `json:"backend"`
	User     string `json:"user"`
	Prefix   string `json:"prefix"`
	Limit    int    `json:"limit"`
	Last     []byte `json:"last"`
	Revision int64  `json:"revision"`
	Expires  int64  `json:"expires"`
}

type keySummary struct {
	Key         string `json:"key"`
	KeyEncoding string `json:"keyEncoding"`
	ModRevision string `json:"modRevision"`
}

type keyPage struct {
	Items      []keySummary `json:"items"`
	NextCursor string       `json:"nextCursor,omitempty"`
	Revision   string       `json:"revision"`
	HasMore    bool         `json:"hasMore"`
}

func (jh *GenericHandler) cursorSignature(payload []byte, password string) []byte {
	mac := hmac.New(sha256.New, jh.cursorSecret)
	_, _ = mac.Write(payload)
	_, _ = mac.Write([]byte{0})
	_, _ = mac.Write([]byte(password))
	return mac.Sum(nil)
}

func (jh *GenericHandler) encodeCursor(cursor keyCursor, password string) (string, error) {
	payload, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(jh.cursorSignature(payload, password))
	if len(token) > maxCursorBytes {
		return "", errors.New("key exceeds cursor size budget")
	}
	return token, nil
}

func (jh *GenericHandler) decodeCursor(token, password string, expected keyCursor) (keyCursor, error) {
	invalid := errors.New("invalid or expired cursor")
	if len(token) > maxCursorBytes {
		return keyCursor{}, invalid
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return keyCursor{}, invalid
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return keyCursor{}, invalid
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(signature, jh.cursorSignature(payload, password)) {
		return keyCursor{}, invalid
	}
	var cursor keyCursor
	if err := json.Unmarshal(payload, &cursor); err != nil {
		return keyCursor{}, invalid
	}
	if cursor.Purpose != expected.Purpose || cursor.Backend != expected.Backend || cursor.User != expected.User || cursor.Prefix != expected.Prefix || cursor.Limit != expected.Limit || cursor.Revision <= 0 || len(cursor.Last) == 0 || cursor.Expires <= time.Now().Unix() {
		return keyCursor{}, invalid
	}
	return cursor, nil
}

func intersectPrefix(ranges []keyRange, prefix string) []keyRange {
	if prefix == "" {
		return ranges
	}
	end := clientv3.GetPrefixRangeEnd(prefix)
	result := make([]keyRange, 0, len(ranges))
	for _, item := range ranges {
		if item.Start < prefix {
			item.Start = prefix
		}
		if end != "\x00" && (item.End == "\x00" || item.End > end) {
			item.End = end
		}
		if item.End == "\x00" || item.Start < item.End {
			result = append(result, item)
		}
	}
	return result
}

// readKeyPage fetches at most limit+1 key metadata records across readable ranges.
func readKeyPage(ctx context.Context, kv clientv3.KV, ranges []keyRange, after string, revision int64, limit int) (*clientv3.GetResponse, error) {
	result := &clientv3.GetResponse{}
	for _, item := range ranges {
		start := item.Start
		if after != "" && start <= after {
			start = after + "\x00"
		}
		if item.End != "\x00" && start >= item.End {
			continue
		}
		options := []clientv3.OpOption{clientv3.WithKeysOnly(), clientv3.WithRange(item.End), clientv3.WithLimit(int64(limit + 1 - len(result.Kvs))), clientv3.WithSort(clientv3.SortByKey, clientv3.SortAscend)}
		if revision != 0 {
			options = append(options, clientv3.WithRev(revision))
		}
		page, err := kv.Get(ctx, start, options...)
		if err != nil {
			return nil, err
		}
		if result.Header == nil {
			result.Header = page.Header
			if revision == 0 {
				revision = page.Header.Revision
			}
		}
		result.Kvs = append(result.Kvs, page.Kvs...)
		if len(result.Kvs) > limit {
			result.More = true
			result.Kvs = result.Kvs[:limit]
			break
		}
	}
	result.Count = int64(len(result.Kvs))
	return result, nil
}

func (jh *GenericHandler) ListKeys(w http.ResponseWriter, r *http.Request) {
	meta, ok := r.Context().Value(META_KEY).(request.RequestMeta)
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
	cursor := keyCursor{Backend: meta.Backend.Name(), User: meta.User, Prefix: prefix, Limit: limit, Expires: time.Now().Add(10 * time.Minute).Unix()}
	if token := query.Get("cursor"); token != "" {
		decoded, err := jh.decodeCursor(token, meta.Pass, cursor)
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
	defer jh.closeEtcdClient(client)
	if _, err := client.Authenticate(ctx, meta.User, meta.Pass); err != nil {
		response.WriteRPCError(w, err)
		return
	}
	ranges, err := readableRanges(ctx, client.Auth, meta.User)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	page, err := readKeyPage(ctx, client.KV, intersectPrefix(ranges, prefix), string(cursor.Last), cursor.Revision, limit)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	output := keyPage{Items: make([]keySummary, 0, len(page.Kvs)), Revision: strconv.FormatInt(cursor.Revision, 10), HasMore: page.More}
	if page.Header != nil && cursor.Revision == 0 {
		cursor.Revision = page.Header.Revision
		output.Revision = strconv.FormatInt(cursor.Revision, 10)
	}
	for _, item := range page.Kvs {
		key, encoding := string(item.Key), "utf8"
		if !utf8.Valid(item.Key) {
			key, encoding = base64.StdEncoding.EncodeToString(item.Key), "base64"
		}
		output.Items = append(output.Items, keySummary{Key: key, KeyEncoding: encoding, ModRevision: strconv.FormatInt(item.ModRevision, 10)})
	}
	if page.More {
		cursor.Last = page.Kvs[len(page.Kvs)-1].Key
		output.NextCursor, err = jh.encodeCursor(cursor, meta.Pass)
		if err != nil {
			response.WriteError(w, http.StatusRequestEntityTooLarge, "cursor_too_large", "last key exceeds the cursor size budget; use a narrower prefix")
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(output)
}

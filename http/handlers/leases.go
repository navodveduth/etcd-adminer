package handlers

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"unicode/utf8"

	"github.com/gorilla/mux"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	clientv3 "go.etcd.io/etcd/client/v3"
)

const maxLeaseTTL = 7 * 24 * 60 * 60

func leaseID(value string) (clientv3.LeaseID, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id == 0 || strconv.FormatInt(id, 10) != value {
		return 0, strconv.ErrSyntax
	}
	return clientv3.LeaseID(id), nil
}

func writeJSON(w http.ResponseWriter, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(value)
}

func (jh *GenericHandler) Leases(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TTL int64 `json:"ttl"`
	}
	if r.Method == http.MethodPost {
		if err := request.DecodeJSON(w, r, &body); err != nil || body.TTL < 1 || body.TTL > maxLeaseTTL {
			response.WriteError(w, http.StatusBadRequest, "invalid_ttl", "TTL must be a whole number between 1 and 604800 seconds")
			return
		}
	}
	client, ctx, cleanup, ok := jh.requestClient(w, r, true)
	if !ok {
		return
	}
	defer cleanup()
	if r.Method == http.MethodPost {
		lease, err := client.Grant(ctx, body.TTL)
		if err != nil {
			response.WriteRPCError(w, err)
			return
		}
		writeJSON(w, struct {
			ID  string `json:"id"`
			TTL int64  `json:"ttl"`
		}{strconv.FormatInt(int64(lease.ID), 10), lease.TTL})
		return
	}
	leases, err := client.Leases(ctx)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	ids := make([]string, 0, len(leases.Leases))
	for _, lease := range leases.Leases {
		ids = append(ids, strconv.FormatInt(int64(lease.ID), 10))
	}
	sort.Strings(ids)
	truncated := len(ids) > 1000
	if truncated {
		ids = ids[:1000]
	}
	writeJSON(w, struct {
		IDs       []string `json:"ids"`
		Truncated bool     `json:"truncated"`
	}{ids, truncated})
}

func (jh *GenericHandler) Lease(w http.ResponseWriter, r *http.Request) {
	id, err := leaseID(mux.Vars(r)["id"])
	if err != nil {
		response.WriteError(w, http.StatusBadRequest, "invalid_lease", "lease ID must be a nonzero decimal string")
		return
	}
	if r.Method == http.MethodDelete {
		var body struct {
			Confirmation string `json:"confirmation"`
		}
		if err := request.DecodeJSON(w, r, &body); err != nil || body.Confirmation != strconv.FormatInt(int64(id), 10) {
			response.WriteError(w, http.StatusBadRequest, "confirmation_required", "confirmation must contain the exact lease ID")
			return
		}
	}
	client, ctx, cleanup, ok := jh.requestClient(w, r, true)
	if !ok {
		return
	}
	defer cleanup()
	switch r.Method {
	case http.MethodDelete:
		if _, err := client.Revoke(ctx, id); err != nil {
			response.WriteRPCError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case http.MethodPost:
		result, err := client.KeepAliveOnce(ctx, id)
		if err != nil {
			response.WriteRPCError(w, err)
			return
		}
		writeJSON(w, struct {
			ID  string `json:"id"`
			TTL int64  `json:"ttl"`
		}{strconv.FormatInt(int64(id), 10), result.TTL})
	default:
		result, err := client.TimeToLive(ctx, id, clientv3.WithAttachedKeys())
		if err != nil {
			response.WriteRPCError(w, err)
			return
		}
		if result.TTL < 0 {
			response.WriteError(w, http.StatusNotFound, "lease_expired", "this lease expired or was revoked")
			return
		}
		keys := make([]keySummary, 0)
		for index, key := range result.Keys {
			if index >= 100 {
				break
			}
			value, encoding := string(key), "utf8"
			if !utf8.Valid(key) {
				value, encoding = base64.StdEncoding.EncodeToString(key), "base64"
			}
			keys = append(keys, keySummary{Key: value, KeyEncoding: encoding})
		}
		writeJSON(w, struct {
			ID         string       `json:"id"`
			TTL        int64        `json:"ttl"`
			GrantedTTL int64        `json:"grantedTTL"`
			Keys       []keySummary `json:"keys"`
			KeyCount   int          `json:"keyCount"`
		}{strconv.FormatInt(int64(id), 10), result.TTL, result.GrantedTTL, keys, len(result.Keys)})
	}
}

package handlers

import (
	"net/http"

	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	"go.etcd.io/etcd/api/v3/authpb"
)

// Capabilities are UI hints only. Every operation remains authorized by etcd.
func (jh *GenericHandler) Capabilities(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	if r.URL.Query().Has("key") && (key == "" || len(key) > 8192) {
		response.WriteError(w, http.StatusBadRequest, "invalid_key", "key must contain 1 to 8192 bytes")
		return
	}
	client, ctx, cleanup, ok := jh.requestClient(w, r, false)
	if !ok {
		return
	}
	defer cleanup()
	meta := r.Context().Value(META_KEY).(request.RequestMeta)
	auth := client.Auth
	user, err := auth.UserGet(ctx, meta.User)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	var admin, read, write bool
	for _, role := range user.Roles {
		if role == "root" {
			admin, read, write = true, true, true
			break
		}
		info, err := auth.RoleGet(ctx, role)
		if err != nil {
			response.WriteRPCError(w, err)
			return
		}
		for _, rule := range info.Perm {
			if key != "" {
				start, end := string(rule.Key), string(rule.RangeEnd)
				if end == "" && key != start || end != "" && (key < start || end != "\x00" && key >= end) {
					continue
				}
			}
			read = read || rule.PermType != authpb.WRITE
			write = write || rule.PermType != authpb.READ
		}
	}
	writeJSON(w, struct {
		Administrator bool `json:"administrator"`
		Read          bool `json:"read"`
		Write         bool `json:"write"`
	}{admin, read, write})
}

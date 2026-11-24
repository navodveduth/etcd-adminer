package handlers

import (
	"net/http"

	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	"go.etcd.io/etcd/api/v3/authpb"
)

// Capabilities are UI hints only. Every operation remains authorized by etcd.
func (jh *GenericHandler) Capabilities(w http.ResponseWriter, r *http.Request) {
	_, ctx, cleanup, ok := jh.requestClient(w, r, false)
	if !ok {
		return
	}
	defer cleanup()
	meta := r.Context().Value(META_KEY).(request.RequestMeta)
	auth := meta.Backend.AdminConnection()
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

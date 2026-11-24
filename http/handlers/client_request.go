package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
)

// requestClient authenticates before privileged metadata discovery and bounds
// ordinary RPCs. Streaming handlers must manage their own lifetime instead.
func (jh *GenericHandler) requestClient(w http.ResponseWriter, r *http.Request, administrator bool) (*etcd.Client, context.Context, func(), bool) {
	meta, ok := r.Context().Value(META_KEY).(request.RequestMeta)
	if !ok || meta.Backend == nil {
		response.WriteError(w, http.StatusInternalServerError, "internal_error", "request metadata missing")
		return nil, nil, nil, false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	client, err := meta.Backend.NewClient(meta.User, meta.Pass)
	if err != nil {
		cancel()
		response.WriteRPCError(w, err)
		return nil, nil, nil, false
	}
	cleanup := func() { _ = client.Close(); cancel() }
	if _, err := client.Authenticate(ctx, meta.User, meta.Pass); err != nil {
		cleanup()
		response.WriteRPCError(w, err)
		return nil, nil, nil, false
	}
	if administrator {
		user, err := meta.Backend.AdminConnection().UserGet(ctx, meta.User)
		if err != nil {
			cleanup()
			response.WriteRPCError(w, err)
			return nil, nil, nil, false
		}
		root := false
		for _, role := range user.Roles {
			if role == "root" {
				root = true
				break
			}
		}
		if !root {
			cleanup()
			response.WriteError(w, http.StatusForbidden, "administrator_required", "this cluster-wide operation requires the etcd root role")
			return nil, nil, nil, false
		}
	}
	return client, ctx, cleanup, true
}

// Package handlerkit provides the shared caller-client lifetime policy only.
// Feature handlers do not depend on each other or on the composition package.
package handlerkit

import (
	"context"
	"net/http"
	"time"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	"github.com/srimaln91/etcd-adminer/log"
)

type Clients struct{ Logger log.Logger }

func (clients *Clients) CloseEtcdClient(client *etcd.Client) {
	if err := client.Close(); err != nil && clients.Logger != nil {
		clients.Logger.Error(context.Background(), err.Error())
	}
}

// RequestClient authenticates before caller-scoped metadata discovery and bounds
// ordinary RPCs. Streaming handlers must manage their own lifetime instead.
func (clients *Clients) RequestClient(w http.ResponseWriter, r *http.Request, administrator bool) (*etcd.Client, context.Context, func(), bool) {
	meta, ok := request.Meta(r.Context())
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
		user, err := client.UserGet(ctx, meta.User)
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

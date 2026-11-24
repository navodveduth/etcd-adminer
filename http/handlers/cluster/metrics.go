package cluster

import (
	"net/http"

	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	telemetry "github.com/srimaln91/etcd-adminer/internal/cluster"
)

func (jh *Handler) Metrics(w http.ResponseWriter, r *http.Request) {
	client, ctx, cleanup, ok := jh.RequestClient(w, r, true)
	if !ok {
		return
	}
	defer cleanup()
	meta, _ := request.Meta(r.Context())
	response.WriteJSON(w, telemetry.Collect(ctx, client, meta.Backend.Endpoints()))
}

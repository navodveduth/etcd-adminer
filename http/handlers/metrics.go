package handlers

import (
	"net/http"

	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/internal/cluster"
)

func (jh *GenericHandler) Metrics(w http.ResponseWriter, r *http.Request) {
	client, ctx, cleanup, ok := jh.requestClient(w, r, true)
	if !ok {
		return
	}
	defer cleanup()
	meta := r.Context().Value(META_KEY).(request.RequestMeta)
	writeJSON(w, cluster.Collect(ctx, client, meta.Backend.Endpoints()))
}

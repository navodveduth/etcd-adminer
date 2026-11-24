package routes

import "net/http"

func (a api) cluster() {
	a.handle("/api/clusterinfo", a.handler.ClusterInfo, http.MethodGet, http.MethodOptions)
	a.handle("/api/v1/cluster/metrics", a.handler.Metrics, http.MethodGet)
}

package routes

import "net/http"

func (a api) cluster() {
	a.handle("/api/clusterinfo", a.handler.Cluster.ClusterInfo, http.MethodGet, http.MethodOptions)
	a.handle("/api/v1/cluster/metrics", a.handler.Cluster.Metrics, http.MethodGet)
}

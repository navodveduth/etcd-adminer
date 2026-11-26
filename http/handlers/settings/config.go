package settings

import (
	"encoding/json"
	"net/http"

	"github.com/srimaln91/etcd-adminer/config"
	"github.com/srimaln91/etcd-adminer/http/response"
)

func (jh *Handler) GetConfig(rw http.ResponseWriter, r *http.Request) {
	if config.AppConfig == nil {
		response.WriteError(rw, http.StatusInternalServerError, "internal_error", "application configuration unavailable")
		return
	}
	cfg := response.GetConfig{Clusters: []response.Cluster{}, ReadOnly: config.AppConfig.HTTP.ReadOnly}
	cfg.RememberSessions = jh.Sessions != nil && jh.Sessions.Available(r)

	for _, cluster := range config.AppConfig.ETCD {
		cfg.Clusters = append(cfg.Clusters, response.Cluster{
			Name:      cluster.Name,
			Endpoints: cluster.Endpoints,
		})
	}

	responseBytes, err := json.Marshal(cfg)
	if err != nil {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	rw.Header().Add("Content-Type", "application/json")
	rw.Header().Set("Cache-Control", "no-store")
	rw.WriteHeader(http.StatusOK)
	rw.Write(responseBytes)
}

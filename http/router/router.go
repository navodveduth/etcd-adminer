package router

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/srimaln91/etcd-adminer/config"
	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/handlers"
	"github.com/srimaln91/etcd-adminer/http/middlewares"
	"github.com/srimaln91/etcd-adminer/log"
)

func NewRouter(logger log.Logger, backendProvider *etcd.BackEndProvider) (http.Handler, error) {

	// Init handler
	requestHandler, err := handlers.NewHTTPHandler(logger)
	if err != nil {
		return nil, err
	}

	validator := middlewares.NewRequestValidateMiddleware(backendProvider)

	r := mux.NewRouter()
	publicOrigin := ""
	readOnly := false
	if config.AppConfig != nil {
		publicOrigin = config.AppConfig.HTTP.PublicOrigin
		readOnly = config.AppConfig.HTTP.ReadOnly
	}
	r.Use(middlewares.SameOrigin(publicOrigin))
	r.Use(middlewares.ReadOnly(readOnly))

	r.HandleFunc("/api/getconfig", requestHandler.GetConfig).Methods(http.MethodGet, http.MethodOptions)
	r.Handle("/api/auth", validator.ValidateRequest(requestHandler.Authenticate)).Methods(http.MethodPost, http.MethodOptions)

	r.Handle("/api/keys", validator.ValidateRequest(requestHandler.GetKey)).Methods(http.MethodGet, http.MethodOptions).Queries("key", "")
	r.Handle("/api/keys", validator.ValidateRequest(requestHandler.GetKeys)).Methods(http.MethodGet, http.MethodOptions)
	r.Handle("/api/v1/keys", validator.ValidateRequest(requestHandler.ListKeys)).Methods(http.MethodGet, http.MethodOptions)
	r.Handle("/api/keys", validator.ValidateRequest(requestHandler.UpdateKey)).Methods(http.MethodPut, http.MethodOptions)
	r.Handle("/api/keys", validator.ValidateRequest(requestHandler.DeleteKey)).Methods(http.MethodDelete, http.MethodOptions)

	r.Handle("/api/directory", validator.ValidateRequest(requestHandler.CreateDirectory)).Methods(http.MethodPost, http.MethodOptions)
	r.Handle("/api/clusterinfo", validator.ValidateRequest(requestHandler.ClusterInfo)).Methods(http.MethodGet, http.MethodOptions)
	r.Handle("/api/v1/leases", validator.ValidateRequest(requestHandler.Leases)).Methods(http.MethodGet, http.MethodPost)
	r.Handle("/api/v1/leases/{id}", validator.ValidateRequest(requestHandler.Lease)).Methods(http.MethodGet, http.MethodDelete)
	r.Handle("/api/v1/leases/{id}/renew", validator.ValidateRequest(requestHandler.Lease)).Methods(http.MethodPost)
	r.Handle("/api/v1/watch", validator.ValidateRequest(requestHandler.Watch)).Methods(http.MethodGet)

	r.Handle("/api/users", validator.ValidateRequest(requestHandler.GetUserList)).Methods(http.MethodGet, http.MethodOptions)
	r.Handle("/api/users", validator.ValidateRequest(requestHandler.CreateUser)).Methods(http.MethodPost, http.MethodOptions)
	r.Handle("/api/users/{name}", validator.ValidateRequest(requestHandler.GetUserInfo)).Methods(http.MethodGet, http.MethodOptions)
	r.Handle("/api/users/{name}", validator.ValidateRequest(requestHandler.DeleteUser)).Methods(http.MethodDelete, http.MethodOptions)
	r.Handle("/api/users/{name}/role/{role}", validator.ValidateRequest(requestHandler.AssignRole)).Methods(http.MethodPost, http.MethodOptions)
	r.Handle("/api/users/{name}/role/{role}", validator.ValidateRequest(requestHandler.UnassignRole)).Methods(http.MethodDelete, http.MethodOptions)

	r.Handle("/api/role", validator.ValidateRequest(requestHandler.GetRoles)).Methods(http.MethodGet, http.MethodOptions)

	spa := spaHandler{staticPath: "static", indexPath: "index.html"}
	r.PathPrefix("/").Handler(spa)

	return r, nil
}

package router

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/srimaln91/etcd-adminer/config"
	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/handlers"
	"github.com/srimaln91/etcd-adminer/http/middlewares"
	"github.com/srimaln91/etcd-adminer/http/routes"
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

	routes.Register(r, requestHandler, validator.ValidateRequest)

	spa := spaHandler{staticPath: "static", indexPath: "index.html"}
	r.PathPrefix("/").Handler(spa)

	return r, nil
}

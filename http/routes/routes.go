// Package routes groups HTTP adapters by feature. Authentication and global
// policy middleware remain owned by the outer router; business logic belongs
// in internal feature packages rather than route registration.
package routes

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/srimaln91/etcd-adminer/http/handlers"
)

type api struct {
	router       *mux.Router
	handler      *handlers.Handler
	authenticate func(http.HandlerFunc) http.Handler
}

func Register(router *mux.Router, handler *handlers.Handler, authenticate func(http.HandlerFunc) http.Handler) {
	a := api{router, handler, authenticate}
	router.HandleFunc("/api/getconfig", handler.Settings.GetConfig).Methods(http.MethodGet, http.MethodOptions)
	a.handle("/api/auth", handler.Access.Authenticate, http.MethodPost, http.MethodOptions)
	a.handle("/api/v1/capabilities", handler.Access.Capabilities, http.MethodGet)
	a.keys()
	a.cluster()
	a.access()
	a.leases()
	a.transfer()
}

func (a api) handle(path string, handler http.HandlerFunc, methods ...string) *mux.Route {
	return a.router.Handle(path, a.authenticate(handler)).Methods(methods...)
}

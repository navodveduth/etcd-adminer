package routes

import (
	"net/http"

	"github.com/gorilla/mux"
)

func (a api) keys() {
	h := a.handler.Keys
	// A query-regexp wildcard does not match embedded newlines. Route by presence
	// instead so every exact etcd key reaches GetKey, never the legacy list API.
	a.handle("/api/keys", h.GetKey, http.MethodGet, http.MethodOptions).MatcherFunc(func(r *http.Request, _ *mux.RouteMatch) bool {
		return r.URL.Query().Has("key")
	})
	a.handle("/api/keys", h.GetKeys, http.MethodGet, http.MethodOptions)
	a.handle("/api/v1/keys", h.ListKeys, http.MethodGet, http.MethodOptions)
	a.handle("/api/v1/folders", h.ListFolder, http.MethodGet, http.MethodOptions)
	a.handle("/api/keys", h.UpdateKey, http.MethodPut, http.MethodOptions)
	a.handle("/api/keys", h.DeleteKey, http.MethodDelete, http.MethodOptions)
	a.handle("/api/directory", h.CreateDirectory, http.MethodPost, http.MethodOptions)
	a.handle("/api/v1/watch", a.handler.Watch.Watch, http.MethodGet)
}

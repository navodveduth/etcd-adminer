package routes

import "net/http"

func (a api) keys() {
	h := a.handler.Keys
	a.handle("/api/keys", h.GetKey, http.MethodGet, http.MethodOptions).Queries("key", "")
	a.handle("/api/keys", h.GetKeys, http.MethodGet, http.MethodOptions)
	a.handle("/api/v1/keys", h.ListKeys, http.MethodGet, http.MethodOptions)
	a.handle("/api/keys", h.UpdateKey, http.MethodPut, http.MethodOptions)
	a.handle("/api/keys", h.DeleteKey, http.MethodDelete, http.MethodOptions)
	a.handle("/api/directory", h.CreateDirectory, http.MethodPost, http.MethodOptions)
	a.handle("/api/v1/watch", a.handler.Watch.Watch, http.MethodGet)
}

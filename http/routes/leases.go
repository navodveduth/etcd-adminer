package routes

import "net/http"

func (a api) leases() {
	a.handle("/api/v1/leases", a.handler.Leases, http.MethodGet, http.MethodPost)
	a.handle("/api/v1/leases/{id}", a.handler.Lease, http.MethodGet, http.MethodDelete)
	a.handle("/api/v1/leases/{id}/renew", a.handler.Lease, http.MethodPost)
}

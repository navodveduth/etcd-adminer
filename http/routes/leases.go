package routes

import "net/http"

func (a api) leases() {
	a.handle("/api/v1/leases", a.handler.Leases.Leases, http.MethodGet, http.MethodPost)
	a.handle("/api/v1/leases/{id}", a.handler.Leases.Lease, http.MethodGet, http.MethodDelete)
	a.handle("/api/v1/leases/{id}/renew", a.handler.Leases.Lease, http.MethodPost)
}

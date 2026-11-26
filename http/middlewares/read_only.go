package middlewares

import (
	"net/http"

	"github.com/srimaln91/etcd-adminer/http/response"
)

func ReadOnly(enabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			allowed := r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions || (r.Method == http.MethodPost && r.URL.Path == "/api/auth") || (r.Method == http.MethodDelete && r.URL.Path == "/api/v1/sessions")
			if enabled && !allowed {
				response.WriteError(w, http.StatusForbidden, "read_only", "this adminer instance is read-only")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

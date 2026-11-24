package middlewares

import (
	"net/http"

	"github.com/srimaln91/etcd-adminer/http/response"
)

// SameOrigin rejects browser cross-origin mutations. Non-browser clients without
// Origin still authenticate normally; this is not a replacement for authorization.
func SameOrigin(publicOrigin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
				expected := publicOrigin
				if expected == "" {
					scheme := "http"
					if r.TLS != nil {
						scheme = "https"
					}
					expected = scheme + "://" + r.Host
				}
				if origin := r.Header.Get("Origin"); origin != "" && origin != expected {
					response.WriteError(w, http.StatusForbidden, "invalid_origin", "cross-origin mutations are not allowed")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

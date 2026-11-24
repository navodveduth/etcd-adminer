package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/srimaln91/etcd-adminer/http/handlers"
)

func TestFeatureRoutesKeepAuthenticationWrapper(t *testing.T) {
	router := mux.NewRouter()
	Register(router, &handlers.GenericHandler{}, func(http.HandlerFunc) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })
	})
	for _, tc := range []struct{ method, path string }{
		{"GET", "/api/v1/cluster/metrics"}, {"GET", "/api/v1/capabilities"},
		{"GET", "/api/v1/keys"}, {"GET", "/api/keys?key=%2Fa"}, {"PUT", "/api/keys"}, {"DELETE", "/api/keys"},
		{"GET", "/api/v1/watch"}, {"POST", "/api/v1/leases"}, {"POST", "/api/v1/leases/1/renew"},
		{"POST", "/api/v1/transfer/batch"}, {"GET", "/api/v1/transfer/export"},
		{"POST", "/api/v1/roles"}, {"DELETE", "/api/v1/roles/detail?name=role"},
		{"POST", "/api/v1/users/password"}, {"DELETE", "/api/users/alice/role/root"},
	} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
		if w.Code != http.StatusTeapot {
			t.Errorf("%s %s bypassed wrapper or disappeared: %d", tc.method, tc.path, w.Code)
		}
	}
}

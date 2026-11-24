package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestReadOnlyRejectsAllMutationsExceptAuthentication(t *testing.T) {
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{"GET", "/api/v1/keys", 204}, {"POST", "/api/auth", 204},
		{"PUT", "/api/keys", 403}, {"DELETE", "/api/keys", 403},
		{"POST", "/api/users", 403}, {"POST", "/api/users/alice/role/root", 403},
		{"POST", "/api/future-mutating-feature", 403}, {"DELETE", "/api/auth", 403},
	} {
		w := httptest.NewRecorder()
		ReadOnly(true)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })).ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
		if w.Code != tc.status {
			t.Fatalf("%s %s = %d, want %d", tc.method, tc.path, w.Code, tc.status)
		}
	}
}

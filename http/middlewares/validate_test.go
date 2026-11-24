package middlewares

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/srimaln91/etcd-adminer/etcd"
)

func TestInvalidRequestsDoNotReachHandler(t *testing.T) {
	for _, tc := range []struct {
		name, backend string
		auth          bool
		status        int
		code          string
	}{
		{"missing credentials", "missing", false, 401, "unauthenticated"},
		{"missing backend", "", true, 400, "invalid_request"},
		{"unknown backend", "missing", true, 400, "invalid_backend"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/api/keys", nil)
			if tc.auth {
				r.SetBasicAuth("alice", "secret")
			}
			r.Header.Set("X-Backend", tc.backend)
			w := httptest.NewRecorder()
			NewRequestValidateMiddleware(etcd.NewBackendProvider()).ValidateRequest(func(http.ResponseWriter, *http.Request) {
				t.Fatal("invalid request reached handler")
			}).ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status = %d, want %d", w.Code, tc.status)
			}
			var body struct {
				Code string `json:"code"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Code != tc.code {
				t.Fatalf("code = %q", body.Code)
			}
		})
	}
}

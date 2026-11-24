package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSameOriginMutations(t *testing.T) {
	for _, tc := range []struct {
		name, method, origin, publicOrigin string
		want                               int
	}{
		{"same origin", "POST", "http://app.local", "", 204},
		{"CLI", "PUT", "", "", 204},
		{"cross origin", "POST", "https://attacker.local", "", 403},
		{"opaque origin", "DELETE", "null", "", 403},
		{"trusted public TLS origin", "POST", "https://admin.example", "https://admin.example", 204},
		{"untrusted forwarded origin", "POST", "https://admin.example", "", 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, "http://app.local/api/users", nil)
			r.Header.Set("Origin", tc.origin)
			w := httptest.NewRecorder()
			SameOrigin(tc.publicOrigin)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })).ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d", w.Code, tc.want)
			}
			if w.Header().Get("Access-Control-Allow-Origin") != "" {
				t.Fatal("unexpected CORS allowance")
			}
		})
	}
}

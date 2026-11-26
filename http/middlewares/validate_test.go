package middlewares

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/internal/browsersession"
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

func TestCookieCredentialsStayCallerScopedAndRequireOriginForMutations(t *testing.T) {
	provider := etcd.NewBackendProvider()
	defer provider.Close()
	if err := provider.RegisterBackend("one", []string{"http://127.0.0.1:1"}); err != nil {
		t.Fatal(err)
	}
	sessions := browsersession.New("")
	login := httptest.NewRequest("POST", "http://localhost/api/auth", nil)
	login.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()
	info, err := sessions.Issue(w, login, browsersession.Credentials{Profile: "saved", Backend: "one", User: "alice", Password: "secret"})
	if err != nil {
		t.Fatal(err)
	}
	cookie := w.Result().Cookies()[0]
	for _, tc := range []struct {
		method, origin, backend, id string
		cookie                      bool
		status                      int
	}{
		{"GET", "", "one", info.ID, true, 204},
		{"PUT", "http://localhost", "one", info.ID, true, 204},
		{"PUT", "", "one", info.ID, true, 403},
		{"PUT", "https://attacker.example", "one", info.ID, true, 403},
		{"GET", "", "other", info.ID, true, 401},
		{"GET", "", "one", "", true, 401},
		{"GET", "", "one", info.ID, false, 401},
	} {
		r := httptest.NewRequest(tc.method, "http://localhost/api/keys", nil)
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("X-Backend", tc.backend)
		r.Header.Set("X-Connection-ID", tc.id)
		if tc.cookie {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		NewRequestValidateMiddleware(provider, sessions).ValidateRequest(func(w http.ResponseWriter, r *http.Request) {
			meta, _ := request.Meta(r.Context())
			if meta.User != "alice" || meta.Pass != "secret" || meta.Backend.Name() != "one" {
				t.Fatal("wrong caller")
			}
			w.WriteHeader(204)
		}).ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("%+v: %d %s", tc, w.Code, w.Body.String())
		}
	}
	r := httptest.NewRequest("GET", "http://localhost/api/keys", nil)
	r.AddCookie(cookie)
	r.Header.Set("X-Backend", "one")
	r.Header.Set("X-Connection-ID", info.ID)
	NewRequestValidateMiddleware(provider, sessions).ValidateRequest(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(401) }).ServeHTTP(httptest.NewRecorder(), r)
	if _, ok := sessions.Resolve(r, info.ID); ok {
		t.Fatal("upstream authentication rejection did not revoke remembered session")
	}
}

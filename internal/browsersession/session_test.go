package browsersession

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func request(target string, cookie *http.Cookie) *http.Request {
	r := httptest.NewRequest("POST", target, nil)
	r.Header.Set("Origin", strings.TrimSuffix(target, "/api/auth"))
	if cookie != nil {
		r.AddCookie(cookie)
	}
	return r
}
func issue(t *testing.T, m *Manager, target string, cookie *http.Cookie, profile, backend, user string) (Connection, *http.Cookie) {
	t.Helper()
	w := httptest.NewRecorder()
	info, err := m.Issue(w, request(target, cookie), Credentials{profile, backend, user, "never-return-this-password"})
	if err != nil {
		t.Fatal(err)
	}
	return info, w.Result().Cookies()[0]
}

func TestCookieFlagsSevenDayExpiryAndIsolation(t *testing.T) {
	m := New("https://admin.example")
	now := time.Date(2026, 11, 26, 0, 0, 0, 0, time.UTC)
	m.now = func() time.Time { return now }
	info, cookie := issue(t, m, "https://admin.example/api/auth", nil, "prod", "one", "alice")
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/" || cookie.Domain != "" || cookie.Name != "__Host-etcd-adminer" || cookie.MaxAge != 604800 {
		t.Fatalf("unsafe cookie: %+v", cookie)
	}
	if !info.ExpiresAt.Equal(now.Add(7 * 24 * time.Hour)) {
		t.Fatal("wrong expiry")
	}
	r := request("https://admin.example/api/auth", cookie)
	if creds, ok := m.Resolve(r, info.ID); !ok || creds.Backend != "one" || creds.User != "alice" {
		t.Fatal("session not resolved")
	}
	if _, ok := m.Resolve(request("https://admin.example/api/auth", nil), info.ID); ok {
		t.Fatal("reference alone authenticated")
	}
	_, other := issue(t, m, "https://admin.example/api/auth", nil, "other", "two", "bob")
	if _, ok := m.Resolve(request("https://admin.example/api/auth", other), info.ID); ok {
		t.Fatal("browser session isolation failed")
	}
	w := httptest.NewRecorder()
	m.List(w, r)
	if strings.Contains(w.Body.String(), "password") || strings.Contains(w.Body.String(), cookie.Value) {
		t.Fatal("leaked credentials or cookie token")
	}
	now = now.Add(Lifetime)
	if _, ok := m.Resolve(r, info.ID); ok {
		t.Fatal("accepted expired session")
	}
	if _, ok := New("https://admin.example").Resolve(r, info.ID); ok {
		t.Fatal("session survived process restart")
	}
}

func TestTransportAndOriginPolicy(t *testing.T) {
	for _, tc := range []struct {
		origin, target  string
		allowed, secure bool
	}{
		{"", "http://localhost:8080/api/auth", true, false},
		{"", "http://127.0.0.1:8080/api/auth", true, false},
		{"", "http://remote.internal/api/auth", false, false},
		{"https://admin.example", "http://internal:8080/api/auth", true, true},
		{"http://remote.internal", "http://localhost:8080/api/auth", false, false},
	} {
		m := New(tc.origin)
		r := request(tc.target, nil)
		r.Header.Set("X-Forwarded-Proto", "https")
		secure, allowed := m.transport(r)
		if allowed != tc.allowed || secure != tc.secure {
			t.Fatalf("wrong transport for %+v", tc)
		}
	}
	m := New("https://admin.example")
	for _, origin := range []string{"", "null", "https://attacker.example", "https://admin.example.attacker.example"} {
		r := request("https://admin.example/api/auth", nil)
		r.Header.Set("Origin", origin)
		if _, err := m.Issue(httptest.NewRecorder(), r, Credentials{Profile: "test"}); err == nil {
			t.Fatalf("accepted origin %q", origin)
		}
	}
}

func TestMultipleConnectionsRevocationAndIdentityRotation(t *testing.T) {
	m := New("")
	first, cookie := issue(t, m, "http://localhost/api/auth", nil, "first", "one", "alice")
	second, cookie := issue(t, m, "http://localhost/api/auth", cookie, "second", "two", "bob")
	r := request("http://localhost/api/auth", cookie)
	if _, ok := m.Resolve(r, first.ID); !ok {
		t.Fatal("second login lost first connection")
	}
	replaced, cookie := issue(t, m, "http://localhost/api/auth", cookie, "first", "one", "root")
	if replaced.ID == first.ID {
		t.Fatal("identity change reused old reference")
	}
	r = request("http://localhost/api/auth", cookie)
	if _, ok := m.Resolve(r, first.ID); ok {
		t.Fatal("old identity still resolves")
	}
	logout := httptest.NewRequest("DELETE", "http://localhost/api/v1/sessions?id="+second.ID, nil)
	logout.AddCookie(cookie)
	for _, origin := range []string{"", "https://attacker.example"} {
		logout.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		m.Logout(w, logout)
		if w.Code != 403 {
			t.Fatal("logout lacked CSRF protection")
		}
	}
	logout.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()
	m.Logout(w, logout)
	if w.Code != 204 {
		t.Fatalf("logout: %d", w.Code)
	}
	if _, ok := m.Resolve(r, second.ID); ok {
		t.Fatal("revoked connection still valid")
	}
	if _, ok := m.Resolve(r, replaced.ID); !ok {
		t.Fatal("revoked unrelated connection")
	}
	all := httptest.NewRequest("DELETE", "http://localhost/api/v1/sessions", nil)
	all.AddCookie(cookie)
	all.Header.Set("Origin", "http://localhost")
	w = httptest.NewRecorder()
	m.Logout(w, all)
	if _, ok := m.Resolve(r, replaced.ID); ok {
		t.Fatal("logout all did not revoke")
	}
	if w.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("cookie not cleared")
	}
}

func TestOptOutAndBoundedConnectionCapacity(t *testing.T) {
	m := New("")
	var cookie *http.Cookie
	for i := 0; i < maxConnections; i++ {
		_, cookie = issue(t, m, "http://localhost/api/auth", cookie, fmt.Sprintf("profile-%d", i), "one", "alice")
	}
	if _, err := m.Issue(httptest.NewRecorder(), request("http://localhost/api/auth", cookie), Credentials{Profile: "overflow"}); err == nil {
		t.Fatal("unbounded connection storage")
	}
	w := httptest.NewRecorder()
	m.ForgetProfile(w, request("http://localhost/api/auth", cookie), "profile-0")
	if _, err := m.Issue(httptest.NewRecorder(), request("http://localhost/api/auth", cookie), Credentials{Profile: "after-revoke"}); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	m.List(w, request("http://localhost/api/auth", cookie))
	var data struct{ Connections []Connection }
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Connections) != maxConnections {
		t.Fatal("wrong bounded session count")
	}
}

func TestConnectionExpiryIsAbsoluteAndIndependent(t *testing.T) {
	m := New("")
	now := time.Now()
	m.now = func() time.Time { return now }
	first, cookie := issue(t, m, "http://localhost/api/auth", nil, "first", "one", "alice")
	now = now.Add(24 * time.Hour)
	second, cookie := issue(t, m, "http://localhost/api/auth", cookie, "second", "two", "bob")
	now = now.Add(6 * 24 * time.Hour)
	r := request("http://localhost/api/auth", cookie)
	if _, ok := m.Resolve(r, first.ID); ok {
		t.Fatal("another login extended an older connection")
	}
	if _, ok := m.Resolve(r, second.ID); !ok {
		t.Fatal("newer connection expired early")
	}
	if _, err := m.Issue(httptest.NewRecorder(), r, Credentials{Profile: "large", Password: strings.Repeat("x", maxCredentialBytes+1)}); err == nil {
		t.Fatal("unbounded credential record accepted")
	}
}

// Package browsersession keeps remembered etcd credentials in server memory.
// Browsers receive an opaque HttpOnly cookie and non-secret connection references.
package browsersession

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"sync"
	"time"
)

const Lifetime = 7 * 24 * time.Hour
const maxGroups = 4096
const maxConnections = 16
const maxCredentialBytes = 16 * 1024
const maxSecretStorage = 32 * 1024 * 1024

type Credentials struct {
	Profile  string `json:"-"`
	Backend  string `json:"-"`
	User     string `json:"-"`
	Password string `json:"-"`
}
type Connection struct {
	ID        string    `json:"id"`
	Profile   string    `json:"profile"`
	Backend   string    `json:"backend"`
	User      string    `json:"user"`
	ExpiresAt time.Time `json:"expiresAt"`
}
type stored struct {
	Connection
	credentials Credentials
}
type group struct {
	expires     time.Time
	connections map[string]stored
}
type Manager struct {
	mu     sync.Mutex
	groups map[[32]byte]*group
	origin string
	now    func() time.Time
}

func New(origin string) *Manager {
	return &Manager{groups: make(map[[32]byte]*group), origin: origin, now: time.Now}
}
func token() (string, error) {
	var data [32]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data[:]), nil
}
func loopback(host string) bool {
	if name, _, err := net.SplitHostPort(host); err == nil {
		host = name
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
func (m *Manager) transport(r *http.Request) (secure, allowed bool) {
	if m.origin != "" {
		u, err := url.Parse(m.origin)
		if err != nil {
			return false, false
		}
		return u.Scheme == "https", u.Scheme == "https" || (u.Scheme == "http" && loopback(u.Host) && loopback(r.Host))
	}
	return r.TLS != nil, r.TLS != nil || loopback(r.Host)
}
func (m *Manager) Available(r *http.Request) bool { _, ok := m.transport(r); return ok }
func (m *Manager) OriginAllowed(r *http.Request) bool {
	expected := m.origin
	if expected == "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		expected = scheme + "://" + r.Host
	}
	return r.Header.Get("Origin") != "" && r.Header.Get("Origin") == expected
}
func (m *Manager) cookieName(r *http.Request) string {
	secure, _ := m.transport(r)
	if secure {
		return "__Host-etcd-adminer"
	}
	return "etcd-adminer-local"
}
func (m *Manager) cookie(r *http.Request) (string, [32]byte) {
	c, err := r.Cookie(m.cookieName(r))
	if err != nil || len(c.Value) != 43 {
		return "", [32]byte{}
	}
	return c.Value, sha256.Sum256([]byte(c.Value))
}
func (m *Manager) setCookie(w http.ResponseWriter, r *http.Request, value string, expires time.Time, remove bool) {
	secure, _ := m.transport(r)
	maxAge := int(Lifetime.Seconds())
	if remove {
		maxAge = -1
		expires = time.Unix(1, 0)
	}
	http.SetCookie(w, &http.Cookie{Name: m.cookieName(r), Value: value, Path: "/", HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode, MaxAge: maxAge, Expires: expires})
}
func (m *Manager) purge(now time.Time) {
	for key, g := range m.groups {
		for id, c := range g.connections {
			if !now.Before(c.ExpiresAt) {
				delete(g.connections, id)
			}
		}
		if !now.Before(g.expires) || len(g.connections) == 0 {
			delete(m.groups, key)
		}
	}
}

// Issue must only be called after verifying these exact credentials with etcd.
func (m *Manager) Issue(w http.ResponseWriter, r *http.Request, credentials Credentials) (Connection, error) {
	size := len(credentials.Profile) + len(credentials.Backend) + len(credentials.User) + len(credentials.Password)
	if size > maxCredentialBytes {
		return Connection{}, errors.New("credentials exceed remembered-session size limit")
	}
	if !m.Available(r) {
		return Connection{}, errors.New("remembered login requires HTTPS")
	}
	if !m.OriginAllowed(r) {
		return Connection{}, errors.New("remembered login requires the same browser origin")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	now := m.now()
	m.purge(now)
	raw, hash := m.cookie(r)
	g := m.groups[hash]
	if raw == "" || g == nil {
		if len(m.groups) >= maxGroups {
			return Connection{}, errors.New("remembered session capacity reached; retry later")
		}
		var err error
		raw, err = token()
		if err != nil {
			return Connection{}, err
		}
		hash = sha256.Sum256([]byte(raw))
		g = &group{connections: make(map[string]stored)}
	}
	id := ""
	for key, c := range g.connections {
		if c.Profile == credentials.Profile {
			if c.Backend == credentials.Backend && c.User == credentials.User {
				id = key
			} else {
				delete(g.connections, key)
			}
			break
		}
	}
	if id == "" {
		if len(g.connections) >= maxConnections {
			return Connection{}, errors.New("disconnect an unused remembered connection before adding another")
		}
		var err error
		id, err = token()
		if err != nil {
			return Connection{}, err
		}
	}
	bytes := size
	for _, existing := range m.groups {
		for key, c := range existing.connections {
			if existing == g && key == id {
				continue
			}
			bytes += len(c.credentials.Profile) + len(c.credentials.Backend) + len(c.credentials.User) + len(c.credentials.Password)
		}
	}
	if bytes > maxSecretStorage {
		return Connection{}, errors.New("remembered session capacity reached")
	}
	info := Connection{ID: id, Profile: credentials.Profile, Backend: credentials.Backend, User: credentials.User, ExpiresAt: now.Add(Lifetime)}
	g.connections[id] = stored{info, credentials}
	g.expires = info.ExpiresAt
	m.groups[hash] = g
	m.setCookie(w, r, raw, g.expires, false)
	return info, nil
}

func (m *Manager) Resolve(r *http.Request, id string) (Credentials, bool) {
	if !m.Available(r) || len(id) != 43 {
		return Credentials{}, false
	}
	raw, hash := m.cookie(r)
	if raw == "" {
		return Credentials{}, false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	g := m.groups[hash]
	now := m.now()
	if g == nil || !now.Before(g.expires) {
		delete(m.groups, hash)
		return Credentials{}, false
	}
	c, ok := g.connections[id]
	if !ok || !now.Before(c.ExpiresAt) {
		delete(g.connections, id)
		return Credentials{}, false
	}
	return c.credentials, true
}

func (m *Manager) ForgetProfile(w http.ResponseWriter, r *http.Request, profile string) {
	if !m.Available(r) || !m.OriginAllowed(r) {
		return
	}
	raw, hash := m.cookie(r)
	if raw == "" {
		return
	}
	m.mu.Lock()
	if g := m.groups[hash]; g != nil {
		for id, c := range g.connections {
			if c.Profile == profile {
				delete(g.connections, id)
			}
		}
		if len(g.connections) == 0 {
			delete(m.groups, hash)
		}
	}
	_, remaining := m.groups[hash]
	m.mu.Unlock()
	if !remaining {
		m.setCookie(w, r, "", time.Time{}, true)
	}
}

func (m *Manager) Revoke(r *http.Request, id string) {
	raw, hash := m.cookie(r)
	if raw == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if g := m.groups[hash]; g != nil {
		delete(g.connections, id)
		if len(g.connections) == 0 {
			delete(m.groups, hash)
		}
	}
}

func (m *Manager) List(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	connections := []Connection{}
	if m.Available(r) {
		raw, hash := m.cookie(r)
		if raw != "" {
			m.mu.Lock()
			m.purge(m.now())
			if g := m.groups[hash]; g != nil {
				for _, c := range g.connections {
					connections = append(connections, c.Connection)
				}
			}
			m.mu.Unlock()
		}
	}
	_ = json.NewEncoder(w).Encode(struct {
		Connections []Connection `json:"connections"`
		Available   bool         `json:"available"`
	}{connections, m.Available(r)})
}

func (m *Manager) Logout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !m.Available(r) || !m.OriginAllowed(r) {
		http.Error(w, "same-origin secure request required", http.StatusForbidden)
		return
	}
	raw, hash := m.cookie(r)
	id := r.URL.Query().Get("id")
	m.mu.Lock()
	if raw != "" {
		if g := m.groups[hash]; g != nil {
			if id == "" {
				delete(m.groups, hash)
			} else {
				delete(g.connections, id)
				if len(g.connections) == 0 {
					delete(m.groups, hash)
				}
			}
		}
	}
	_, remaining := m.groups[hash]
	m.mu.Unlock()
	if id == "" || !remaining {
		m.setCookie(w, r, "", time.Time{}, true)
	}
	w.WriteHeader(http.StatusNoContent)
}

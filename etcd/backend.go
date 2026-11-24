package etcd

import "crypto/tls"

type BackEnd struct {
	name           string
	endpoints      []string
	protectedUsers map[string]bool
	tlsConfig      *tls.Config
}

func (be *BackEnd) Name() string {
	return be.name
}

func (be *BackEnd) Endpoints() []string {
	return append([]string(nil), be.endpoints...)
}

// NewClient applies the backend transport policy to every caller-scoped client.
func (be *BackEnd) NewClient(user, password string, options ...func(*Config)) (*Client, error) {
	policy := append([]func(*Config){}, options...)
	policy = append(policy, WithTLS(be.tlsConfig), WithAuth(user, password))
	return NewClient(be.endpoints, policy...)
}

// IsProtectedUser is an optional account-management guard, not an identity used
// to connect to etcd. No account credentials are retained by a backend.
func (be *BackEnd) IsProtectedUser(name string) bool {
	return be.protectedUsers[name]
}

func WithProtectedUsers(names ...string) func(*Config) {
	return func(cfg *Config) { cfg.protectedUsers = append([]string(nil), names...) }
}

package etcd

import (
	"errors"
	"fmt"
	"strings"
)

type BackEndProvider struct {
	backEnds map[string]*BackEnd
}

var ErrBackendNotFound error = errors.New("backend not found")
var ErrAuthenticationFailed error = errors.New("authentication failed")
var ErrNoConnectivity error = errors.New("can not reach ETCD nodes")

func NewBackendProvider() *BackEndProvider {
	return &BackEndProvider{
		backEnds: make(map[string]*BackEnd),
	}
}

// RegisterBackend validates and records transport configuration only. It does
// not create a shared client, dial endpoints, or require startup credentials.
func (bp *BackEndProvider) RegisterBackend(name string, endpoints []string, options ...func(*Config)) error {
	if strings.TrimSpace(name) == "" {
		return errors.New("backend name is required")
	}

	if _, exists := bp.backEnds[name]; exists {
		return fmt.Errorf("duplicate backend %q", name)
	}
	cfg, err := clientConfig(endpoints, options...)
	if err != nil {
		return err
	}
	if cfg.etcdConfig.Username != "" || cfg.etcdConfig.Password != "" {
		return errors.New("backend registration does not accept credentials; authenticate per connection")
	}
	protected := make(map[string]bool)
	for _, user := range cfg.protectedUsers {
		if user != "" {
			protected[user] = true
		}
	}

	bp.backEnds[name] = &BackEnd{
		name:           name,
		endpoints:      append([]string(nil), endpoints...),
		protectedUsers: protected,
		tlsConfig:      cfg.etcdConfig.TLS,
	}

	return nil
}

// Close is kept for lifecycle compatibility. Backends no longer own clients;
// each request/stream owns and closes its caller-authenticated client.
func (bp *BackEndProvider) Close() error {
	return nil
}

func (bp *BackEndProvider) GetBackend(name string) (*BackEnd, error) {
	backEnd, ok := bp.backEnds[name]
	if !ok {
		return nil, ErrBackendNotFound
	}

	return backEnd, nil
}

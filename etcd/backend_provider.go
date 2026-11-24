package etcd

import (
	"context"
	"errors"
	"fmt"
	"time"
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

// RegisterBackend registers a new ETCD backend
func (bp *BackEndProvider) RegisterBackend(name string, endpoints []string, userName, password string, options ...func(*Config)) error {

	if _, exists := bp.backEnds[name]; exists {
		return fmt.Errorf("duplicate backend %q", name)
	}
	clientOptions := append([]func(*Config){}, options...)
	clientOptions = append(clientOptions, WithAuth(userName, password))
	adminClient, err := NewClient(endpoints, clientOptions...)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err = adminClient.Authenticate(ctx, userName, password)
	if err != nil {
		_ = adminClient.Close()
		return fmt.Errorf("%q: %w", name, err)
	}

	bp.backEnds[name] = &BackEnd{
		name:        name,
		endpoints:   append([]string(nil), endpoints...),
		adminClient: adminClient,
		tlsConfig:   adminClient.tlsConfig,
	}

	return nil
}

// Close releases the registered clients. Call only after HTTP handlers stop.
func (bp *BackEndProvider) Close() error {
	var firstErr error
	for _, backend := range bp.backEnds {
		if err := backend.adminClient.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (bp *BackEndProvider) GetBackend(name string) (*BackEnd, error) {
	backEnd, ok := bp.backEnds[name]
	if !ok {
		return nil, ErrBackendNotFound
	}

	return backEnd, nil
}

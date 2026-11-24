package etcd

import (
	"context"
	"crypto/tls"
	"errors"
	"strings"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
	"go.uber.org/zap"
)

type Config struct {
	etcdConfig clientv3.Config
}

type Client struct {
	*clientv3.Client
	tlsConfig *tls.Config
}

func NewClient(endpoints []string, options ...func(*Config)) (*Client, error) {

	cfg := Config{
		etcdConfig: clientv3.Config{
			Endpoints:   endpoints,
			DialTimeout: time.Second * 5,
		},
	}

	// Apply options
	for _, o := range options {
		o(&cfg)
	}
	if len(endpoints) == 0 {
		return nil, errors.New("at least one etcd endpoint is required")
	}
	for _, endpoint := range endpoints {
		if strings.HasPrefix(endpoint, "https://") && cfg.etcdConfig.TLS == nil {
			cfg.etcdConfig.TLS = &tls.Config{MinVersion: tls.VersionTLS12}
		}
	}
	if cfg.etcdConfig.TLS != nil {
		if err := validateTLSConfig(cfg.etcdConfig.TLS); err != nil {
			return nil, err
		}
	}
	for _, endpoint := range endpoints {
		if err := validateEndpoint(endpoint, cfg.etcdConfig.TLS != nil); err != nil {
			return nil, err
		}
	}

	c, err := clientv3.New(cfg.etcdConfig)
	if err != nil {
		return nil, err
	}

	return &Client{Client: c, tlsConfig: cfg.etcdConfig.TLS}, nil
}

// Status validates discovered member targets as well as configured endpoints.
func (client *Client) Status(ctx context.Context, endpoint string) (*clientv3.StatusResponse, error) {
	if err := validateEndpoint(endpoint, client.tlsConfig != nil); err != nil {
		return nil, err
	}
	return client.Client.Status(ctx, endpoint)
}

func WithAuth(username, password string) func(*Config) {
	return func(cfg *Config) {
		cfg.etcdConfig.Username = username
		cfg.etcdConfig.Password = password
	}
}

func WithLogger(logger *zap.Logger) func(*Config) {
	return func(cfg *Config) {
		cfg.etcdConfig.Logger = logger
	}
}

// WithMaxReceiveBytes bounds individual gRPC messages for streaming workflows.
func WithMaxReceiveBytes(limit int) func(*Config) {
	return func(cfg *Config) { cfg.etcdConfig.MaxCallRecvMsgSize = limit }
}

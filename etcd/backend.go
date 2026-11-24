package etcd

import "crypto/tls"

type BackEnd struct {
	name        string
	endpoints   []string
	adminClient *Client
	tlsConfig   *tls.Config
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

func (be *BackEnd) AdminConnection() *Client {
	return be.adminClient
}

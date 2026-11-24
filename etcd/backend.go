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
func (be *BackEnd) NewClient(user, password string) (*Client, error) {
	return NewClient(be.endpoints, WithTLS(be.tlsConfig), WithAuth(user, password))
}

func (be *BackEnd) AdminConnection() *Client {
	return be.adminClient
}

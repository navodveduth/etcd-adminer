// Package handlers composes independent HTTP feature handlers. Feature packages
// depend on handlerkit/request/response, never on this composition package.
package handlers

import (
	"github.com/srimaln91/etcd-adminer/http/handlers/access"
	"github.com/srimaln91/etcd-adminer/http/handlers/cluster"
	"github.com/srimaln91/etcd-adminer/http/handlers/handlerkit"
	"github.com/srimaln91/etcd-adminer/http/handlers/keys"
	"github.com/srimaln91/etcd-adminer/http/handlers/leases"
	"github.com/srimaln91/etcd-adminer/http/handlers/settings"
	"github.com/srimaln91/etcd-adminer/http/handlers/transfer"
	"github.com/srimaln91/etcd-adminer/http/handlers/watch"
	"github.com/srimaln91/etcd-adminer/internal/keyspace"
	"github.com/srimaln91/etcd-adminer/log"
)

type Handler struct {
	Access   *access.Handler
	Cluster  *cluster.Handler
	Keys     *keys.Handler
	Leases   *leases.Handler
	Settings *settings.Handler
	Transfer *transfer.Handler
	Watch    *watch.Handler
}

func NewHTTPHandler(logger log.Logger) (*Handler, error) {
	signer, err := keyspace.NewSigner()
	if err != nil {
		return nil, err
	}
	clients := &handlerkit.Clients{Logger: logger}
	return &Handler{
		Access: &access.Handler{Clients: clients}, Cluster: &cluster.Handler{Clients: clients},
		Keys: &keys.Handler{Clients: clients, Signer: signer}, Leases: &leases.Handler{Clients: clients},
		Settings: &settings.Handler{}, Transfer: &transfer.Handler{Clients: clients, Signer: signer},
		Watch: &watch.Handler{Clients: clients},
	}, nil
}

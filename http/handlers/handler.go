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
	"github.com/srimaln91/etcd-adminer/internal/browsersession"
	"github.com/srimaln91/etcd-adminer/internal/keyspace"
	"github.com/srimaln91/etcd-adminer/log"
)

type Handler struct {
	Sessions *browsersession.Manager
	Access   *access.Handler
	Cluster  *cluster.Handler
	Keys     *keys.Handler
	Leases   *leases.Handler
	Settings *settings.Handler
	Transfer *transfer.Handler
	Watch    *watch.Handler
}

func NewHTTPHandler(logger log.Logger, managers ...*browsersession.Manager) (*Handler, error) {
	signer, err := keyspace.NewSigner()
	if err != nil {
		return nil, err
	}
	clients := &handlerkit.Clients{Logger: logger}
	sessions := browsersession.New("")
	if len(managers) != 0 {
		sessions = managers[0]
	}
	return &Handler{
		Sessions: sessions,
		Access:   &access.Handler{Clients: clients, Sessions: sessions}, Cluster: &cluster.Handler{Clients: clients},
		Keys: &keys.Handler{Clients: clients, Signer: signer}, Leases: &leases.Handler{Clients: clients},
		Settings: &settings.Handler{Sessions: sessions}, Transfer: &transfer.Handler{Clients: clients, Signer: signer},
		Watch: &watch.Handler{Clients: clients},
	}, nil
}

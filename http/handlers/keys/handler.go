package keys

import (
	"github.com/srimaln91/etcd-adminer/http/handlers/handlerkit"
	"github.com/srimaln91/etcd-adminer/internal/keyspace"
)

type Handler struct {
	*handlerkit.Clients
	Signer *keyspace.Signer
}

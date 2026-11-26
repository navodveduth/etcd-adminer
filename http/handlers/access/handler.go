package access

import (
	"github.com/srimaln91/etcd-adminer/http/handlers/handlerkit"
	"github.com/srimaln91/etcd-adminer/internal/browsersession"
)

type Handler struct {
	*handlerkit.Clients
	Sessions *browsersession.Manager
}

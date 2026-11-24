package watch

import (
	"github.com/srimaln91/etcd-adminer/http/handlers/handlerkit"
	"sync"
)

// One instance is shared by all routes to enforce instance-wide quotas.
type Handler struct {
	*handlerkit.Clients
	watchMu    sync.Mutex
	watches    map[watchPrincipal]int
	watchCount int
}

func (handler *Handler) Active() int {
	handler.watchMu.Lock()
	defer handler.watchMu.Unlock()
	return handler.watchCount
}

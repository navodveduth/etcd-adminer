package handlers

import (
	"context"
	"crypto/rand"
	"sync"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/log"
	clientv3 "go.etcd.io/etcd/client/v3"
)

type MetaKey string

const META_KEY MetaKey = "meta"

type GenericHandler struct {
	logger       log.Logger
	cursorSecret []byte
	watchMu      sync.Mutex
	watches      map[watchPrincipal]int
	watchCount   int
}

func NewHTTPHandler(logger log.Logger) (*GenericHandler, error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}

	return &GenericHandler{
		logger:       logger,
		cursorSecret: secret,
		watches:      make(map[watchPrincipal]int),
	}, nil
}

func (jh *GenericHandler) getKeys(ctx context.Context, backend *etcd.BackEnd, user, pass string) (*clientv3.GetResponse, error) {

	client, err := backend.NewClient(user, pass)
	if err != nil {
		return nil, err
	}

	defer jh.closeEtcdClient(client)

	// Authenticate before caller-scoped permission discovery, including empty-role users.
	if _, err := client.Authenticate(ctx, user, pass); err != nil {
		return nil, err
	}
	ranges, err := readableRanges(ctx, client.Auth, user)
	if err != nil {
		return nil, err
	}
	// Key reads always run as the caller, never through the privileged client.
	return readRanges(ctx, client.KV, ranges)
}

func (jh *GenericHandler) closeEtcdClient(client *etcd.Client) {
	err := client.Close()
	if err != nil {
		jh.logger.Error(context.TODO(), err.Error())
	}
}

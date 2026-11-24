package handlers

import (
	"context"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/log"
	clientv3 "go.etcd.io/etcd/client/v3"
)

type MetaKey string

const META_KEY MetaKey = "meta"

type GenericHandler struct {
	logger log.Logger
}

func NewHTTPHandler(logger log.Logger) (*GenericHandler, error) {

	return &GenericHandler{
		logger: logger,
	}, nil
}

func (jh *GenericHandler) getKeys(ctx context.Context, backend *etcd.BackEnd, user, pass string) (*clientv3.GetResponse, error) {

	client, err := etcd.NewClient(backend.Endpoints(), etcd.WithAuth(user, pass))
	if err != nil {
		return nil, err
	}

	defer jh.closeEtcdClient(client)

	// Authenticate before privileged permission discovery, including empty-role users.
	if _, err := client.Authenticate(ctx, user, pass); err != nil {
		return nil, err
	}
	ranges, err := readableRanges(ctx, backend.AdminConnection().Auth, user)
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

package request

import (
	"context"
	"github.com/srimaln91/etcd-adminer/etcd"
)

type metaKey struct{}

func WithMeta(ctx context.Context, meta RequestMeta) context.Context {
	return context.WithValue(ctx, metaKey{}, meta)
}

func Meta(ctx context.Context) (RequestMeta, bool) {
	meta, ok := ctx.Value(metaKey{}).(RequestMeta)
	return meta, ok
}

type RequestMeta struct {
	User    string
	Pass    string
	Backend *etcd.BackEnd
}

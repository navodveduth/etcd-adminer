// Package keyspace owns caller-scoped readable ranges and snapshot pagination.
package keyspace

import (
	"context"
	"github.com/srimaln91/etcd-adminer/etcd"
	"sort"

	"go.etcd.io/etcd/api/v3/authpb"
	clientv3 "go.etcd.io/etcd/client/v3"
)

// Range is a half-open byte range. End == "\x00" means unbounded.
type Range struct{ Start, End string }

func ReadableRanges(ctx context.Context, auth clientv3.Auth, username string) ([]Range, error) {
	user, err := auth.UserGet(ctx, username)
	if err != nil {
		return nil, err
	}
	var ranges []Range
	for _, role := range user.Roles {
		if role == "root" {
			return []Range{{"\x00", "\x00"}}, nil
		}
		info, err := auth.RoleGet(ctx, role)
		if err != nil {
			return nil, err
		}
		for _, permission := range info.Perm {
			if permission.PermType == authpb.WRITE {
				continue
			}
			start, end := string(permission.Key), string(permission.RangeEnd)
			if end == "" {
				end = start + "\x00"
			} // exact key, not its descendants
			ranges = append(ranges, Range{start, end})
		}
	}
	return mergeRanges(ranges), nil
}

func mergeRanges(ranges []Range) []Range {
	sort.Slice(ranges, func(i, j int) bool { return ranges[i].Start < ranges[j].Start })
	merged := make([]Range, 0, len(ranges))
	for _, current := range ranges {
		if len(merged) == 0 {
			merged = append(merged, current)
			continue
		}
		last := &merged[len(merged)-1]
		if last.End == "\x00" {
			continue
		}
		if current.Start > last.End {
			merged = append(merged, current)
			continue
		}
		if current.End == "\x00" || current.End > last.End {
			last.End = current.End
		}
	}
	return merged
}

func readRanges(ctx context.Context, kv clientv3.KV, ranges []Range) (*clientv3.GetResponse, error) {
	result := &clientv3.GetResponse{}
	var revision int64
	for _, keyRange := range ranges {
		options := []clientv3.OpOption{clientv3.WithKeysOnly(), clientv3.WithRange(keyRange.End), clientv3.WithSort(clientv3.SortByKey, clientv3.SortAscend)}
		if revision != 0 {
			options = append(options, clientv3.WithRev(revision))
		}
		page, err := kv.Get(ctx, keyRange.Start, options...)
		if err != nil {
			return nil, err
		}
		if revision == 0 && page.Header != nil {
			revision = page.Header.Revision
			result.Header = page.Header
		}
		result.Kvs = append(result.Kvs, page.Kvs...)
	}
	result.Count = int64(len(result.Kvs))
	return result, nil
}

// ReadForUser supports the deprecated whole-tree endpoint. New callers should
// use ReadPage; this preserves the existing legacy query semantics.
func ReadForUser(ctx context.Context, backend *etcd.BackEnd, user, pass string) (*clientv3.GetResponse, error) {
	client, err := backend.NewClient(user, pass)
	if err != nil {
		return nil, err
	}
	defer client.Close()
	if _, err := client.Authenticate(ctx, user, pass); err != nil {
		return nil, err
	}
	ranges, err := ReadableRanges(ctx, client.Auth, user)
	if err != nil {
		return nil, err
	}
	return readRanges(ctx, client.KV, ranges)
}

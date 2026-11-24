package handlers

import (
	"context"
	"sort"

	"go.etcd.io/etcd/api/v3/authpb"
	clientv3 "go.etcd.io/etcd/client/v3"
)

// keyRange is a half-open byte range. End == "\x00" means unbounded.
type keyRange struct{ Start, End string }

func readableRanges(ctx context.Context, auth clientv3.Auth, username string) ([]keyRange, error) {
	user, err := auth.UserGet(ctx, username)
	if err != nil {
		return nil, err
	}
	var ranges []keyRange
	for _, role := range user.Roles {
		if role == "root" {
			return []keyRange{{"\x00", "\x00"}}, nil
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
			ranges = append(ranges, keyRange{start, end})
		}
	}
	return mergeRanges(ranges), nil
}

func mergeRanges(ranges []keyRange) []keyRange {
	sort.Slice(ranges, func(i, j int) bool { return ranges[i].Start < ranges[j].Start })
	merged := make([]keyRange, 0, len(ranges))
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

func readRanges(ctx context.Context, kv clientv3.KV, ranges []keyRange) (*clientv3.GetResponse, error) {
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

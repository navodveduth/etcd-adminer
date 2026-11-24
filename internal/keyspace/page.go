package keyspace

import (
	"context"
	clientv3 "go.etcd.io/etcd/client/v3"
)

func IntersectPrefix(ranges []Range, prefix string) []Range {
	if prefix == "" {
		return ranges
	}
	end := clientv3.GetPrefixRangeEnd(prefix)
	result := make([]Range, 0, len(ranges))
	for _, item := range ranges {
		if item.Start < prefix {
			item.Start = prefix
		}
		if end != "\x00" && (item.End == "\x00" || item.End > end) {
			item.End = end
		}
		if item.End == "\x00" || item.Start < item.End {
			result = append(result, item)
		}
	}
	return result
}

// ReadPage fetches at most limit+1 key metadata records across readable ranges.
func ReadPage(ctx context.Context, kv clientv3.KV, ranges []Range, after string, revision int64, limit int) (*clientv3.GetResponse, error) {
	result := &clientv3.GetResponse{}
	for _, item := range ranges {
		start := item.Start
		if after != "" && start <= after {
			start = after + "\x00"
		}
		if item.End != "\x00" && start >= item.End {
			continue
		}
		options := []clientv3.OpOption{clientv3.WithKeysOnly(), clientv3.WithRange(item.End), clientv3.WithLimit(int64(limit + 1 - len(result.Kvs))), clientv3.WithSort(clientv3.SortByKey, clientv3.SortAscend)}
		if revision != 0 {
			options = append(options, clientv3.WithRev(revision))
		}
		page, err := kv.Get(ctx, start, options...)
		if err != nil {
			return nil, err
		}
		if result.Header == nil {
			result.Header = page.Header
			if revision == 0 {
				revision = page.Header.Revision
			}
		}
		result.Kvs = append(result.Kvs, page.Kvs...)
		if len(result.Kvs) > limit {
			result.More = true
			result.Kvs = result.Kvs[:limit]
			break
		}
	}
	result.Count = int64(len(result.Kvs))
	return result, nil
}

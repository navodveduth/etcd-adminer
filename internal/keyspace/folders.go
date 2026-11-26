package keyspace

import (
	"context"
	"strings"

	clientv3 "go.etcd.io/etcd/client/v3"
)

type FolderEntry struct {
	Key       string
	Directory bool
}

type FolderPage struct {
	Items    []FolderEntry
	Revision int64
	More     bool
	Next     string
}

// ReadFolder discovers immediate children with keys-only, limit-one seeks.
// After discovering a directory, seek past its entire subtree rather than
// transferring its descendants. Every seek stays inside a caller-readable range.
// after is an inclusive next-seek position (unlike ReadPage's last-key cursor).
func ReadFolder(ctx context.Context, kv clientv3.KV, ranges []Range, prefix, after string, revision int64, limit int) (*FolderPage, error) {
	result := &FolderPage{Revision: revision}
	seek := after
	for _, item := range ranges {
		start := item.Start
		if seek > start {
			start = seek
		}
		for item.End == "\x00" || start < item.End {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			options := []clientv3.OpOption{clientv3.WithKeysOnly(), clientv3.WithRange(item.End), clientv3.WithLimit(1), clientv3.WithSort(clientv3.SortByKey, clientv3.SortAscend)}
			if result.Revision != 0 {
				options = append(options, clientv3.WithRev(result.Revision))
			}
			page, err := kv.Get(ctx, start, options...)
			if err != nil {
				return nil, err
			}
			if result.Revision == 0 && page.Header != nil {
				result.Revision = page.Header.Revision
			}
			if len(page.Kvs) == 0 {
				break
			}
			if len(result.Items) == limit {
				result.More = true
				return result, nil
			}
			key := string(page.Kvs[0].Key)
			rest := strings.TrimPrefix(key, prefix)
			offset := len(prefix)
			// The display root includes both absolute and relative etcd paths.
			if prefix == "" && strings.HasPrefix(rest, "/") {
				rest = rest[1:]
				offset++
			}
			entry := FolderEntry{Key: key}
			seek = key + "\x00"
			if slash := strings.IndexByte(rest, '/'); slash >= 0 {
				entry.Key = key[:offset+slash]
				entry.Directory = true
				seek = clientv3.GetPrefixRangeEnd(entry.Key + "/")
			}
			result.Items = append(result.Items, entry)
			result.Next = seek
			start = seek
		}
	}
	return result, nil
}

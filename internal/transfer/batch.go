// Package transfer implements bounded, atomic, revision-checked logical batches.
package transfer

import (
	"context"
	"encoding/base64"
	"errors"
	"strconv"

	clientv3 "go.etcd.io/etcd/client/v3"
)

const MaxRecords = 50
const MaxValueBytes = 128 * 1024

type Record struct {
	KeyBase64        string `json:"keyBase64"`
	ValueBase64      string `json:"valueBase64"`
	ExpectedRevision string `json:"expectedRevision,omitempty"`
}
type Batch struct {
	Version      int      `json:"version"`
	Operation    string   `json:"operation"`
	Policy       string   `json:"policy"`
	DryRun       bool     `json:"dryRun"`
	Confirmation string   `json:"confirmation"`
	Records      []Record `json:"records"`
}
type Result struct {
	Records  []Record `json:"records"`
	Existing int      `json:"existing"`
	Applied  bool     `json:"applied"`
	Revision string   `json:"revision,omitempty"`
}

func Validate(batch Batch) error {
	if batch.Version != 1 || (batch.Operation != "import" && batch.Operation != "delete") || (batch.Policy != "create" && batch.Policy != "overwrite") || len(batch.Records) < 1 || len(batch.Records) > MaxRecords {
		return errors.New("version 1, import/delete, create/overwrite policy, and 1–50 records are required")
	}
	seen := make(map[string]bool)
	totalBytes := 0
	for _, record := range batch.Records {
		key, err := base64.StdEncoding.DecodeString(record.KeyBase64)
		if err != nil || len(key) == 0 || len(key) > 8192 || seen[string(key)] {
			return errors.New("keys must be unique, nonempty base64 byte strings of at most 8192 bytes")
		}
		seen[string(key)] = true
		value, err := base64.StdEncoding.DecodeString(record.ValueBase64)
		if err != nil || len(value) > MaxValueBytes {
			return errors.New("values must be base64 byte strings of at most 128 KiB")
		}
		totalBytes += len(key) + len(value)
		if totalBytes > 1024*1024 {
			return errors.New("decoded batch exceeds 1 MiB; split the file into smaller batches")
		}
		if !batch.DryRun {
			revision, err := strconv.ParseInt(record.ExpectedRevision, 10, 64)
			if err != nil || revision < 0 || strconv.FormatInt(revision, 10) != record.ExpectedRevision {
				return errors.New("apply requires each previewed expectedRevision as a canonical non-negative decimal string")
			}
			if batch.Operation == "import" && batch.Policy == "create" && revision != 0 {
				return errors.New("create-only policy conflicts with existing keys; change the policy and preview again")
			}
		}
	}
	return nil
}

// Preview fixes one read revision for all keys. Apply is a single etcd
// transaction: any conflict or authorization failure prevents the entire batch.
func Execute(ctx context.Context, kv clientv3.KV, batch Batch) (Result, error) {
	if err := Validate(batch); err != nil {
		return Result{}, err
	}
	result := Result{Records: append([]Record(nil), batch.Records...)}
	if batch.DryRun {
		var revision int64
		for i, record := range batch.Records {
			key, _ := base64.StdEncoding.DecodeString(record.KeyBase64)
			options := []clientv3.OpOption{clientv3.WithKeysOnly()}
			if revision != 0 {
				options = append(options, clientv3.WithRev(revision))
			}
			current, err := kv.Get(ctx, string(key), options...)
			if err != nil {
				return Result{}, err
			}
			if revision == 0 {
				revision = current.Header.Revision
			}
			result.Records[i].ExpectedRevision = "0"
			if len(current.Kvs) > 0 {
				result.Existing++
				result.Records[i].ExpectedRevision = strconv.FormatInt(current.Kvs[0].ModRevision, 10)
			}
		}
		result.Revision = strconv.FormatInt(revision, 10)
		return result, nil
	}
	comparisons := make([]clientv3.Cmp, 0, len(batch.Records))
	ops := make([]clientv3.Op, 0, len(batch.Records))
	for _, record := range batch.Records {
		key, _ := base64.StdEncoding.DecodeString(record.KeyBase64)
		value, _ := base64.StdEncoding.DecodeString(record.ValueBase64)
		revision, _ := strconv.ParseInt(record.ExpectedRevision, 10, 64)
		comparisons = append(comparisons, clientv3.Compare(clientv3.ModRevision(string(key)), "=", revision))
		if batch.Operation == "delete" {
			ops = append(ops, clientv3.OpDelete(string(key)))
		} else if revision > 0 {
			ops = append(ops, clientv3.OpPut(string(key), string(value), clientv3.WithIgnoreLease()))
		} else {
			ops = append(ops, clientv3.OpPut(string(key), string(value)))
		}
	}
	response, err := kv.Txn(ctx).If(comparisons...).Then(ops...).Commit()
	if err != nil {
		return Result{}, err
	}
	result.Applied, result.Revision = response.Succeeded, strconv.FormatInt(response.Header.Revision, 10)
	return result, nil
}

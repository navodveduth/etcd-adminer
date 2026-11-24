package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	clientv3 "go.etcd.io/etcd/client/v3"
)

func (jh *GenericHandler) UpdateKey(w http.ResponseWriter, r *http.Request) {
	var body request.CreateKeyRequest
	if err := request.DecodeJSON(w, r, &body); err != nil || body.Key == "" {
		response.WriteError(w, http.StatusBadRequest, "invalid_request", "a non-empty key and valid JSON object are required")
		return
	}
	revision, err := strconv.ParseInt(body.ExpectedRevision, 10, 64)
	if err != nil || revision < 0 {
		response.WriteError(w, http.StatusBadRequest, "invalid_revision", "expectedRevision must be a non-negative decimal string; use 0 to create a key")
		return
	}
	comparison := clientv3.Compare(clientv3.ModRevision(body.Key), "=", revision)
	options := []clientv3.OpOption{clientv3.WithIgnoreLease()}
	if revision == 0 {
		comparison = clientv3.Compare(clientv3.Version(body.Key), "=", 0)
		options = nil
	}
	if body.Lease != nil {
		id, err := strconv.ParseInt(*body.Lease, 10, 64)
		if err != nil || strconv.FormatInt(id, 10) != *body.Lease {
			response.WriteError(w, http.StatusBadRequest, "invalid_lease", "lease must be a decimal string; use 0 to detach")
			return
		}
		options = []clientv3.OpOption{clientv3.WithLease(clientv3.LeaseID(id))}
	}
	client, ctx, cleanup, ok := jh.requestClient(w, r, false)
	if !ok {
		return
	}
	defer cleanup()
	result, err := client.Txn(ctx).If(comparison).Then(clientv3.OpPut(body.Key, body.Value, options...)).Commit()
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	if !result.Succeeded {
		response.WriteError(w, http.StatusConflict, "revision_conflict", "the key changed; reload before saving")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response.UpdateKeyResponse{Revision: result.Header.Revision})
}

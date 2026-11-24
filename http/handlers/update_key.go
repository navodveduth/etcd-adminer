package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	clientv3 "go.etcd.io/etcd/client/v3"
)

func (jh *GenericHandler) UpdateKey(w http.ResponseWriter, r *http.Request) {
	meta, ok := r.Context().Value(META_KEY).(request.RequestMeta)
	if !ok {
		response.WriteError(w, http.StatusInternalServerError, "internal_error", "request metadata missing")
		return
	}
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
	client, err := etcd.NewClient(meta.Backend.Endpoints(), etcd.WithAuth(meta.User, meta.Pass))
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	defer jh.closeEtcdClient(client)

	comparison := clientv3.Compare(clientv3.ModRevision(body.Key), "=", revision)
	options := []clientv3.OpOption{clientv3.WithIgnoreLease()}
	if revision == 0 {
		comparison = clientv3.Compare(clientv3.Version(body.Key), "=", 0)
		options = nil
	}
	result, err := client.Txn(r.Context()).If(comparison).Then(clientv3.OpPut(body.Key, body.Value, options...)).Commit()
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

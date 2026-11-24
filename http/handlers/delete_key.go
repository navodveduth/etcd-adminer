package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	"go.etcd.io/etcd/api/v3/v3rpc/rpctypes"
	clientv3 "go.etcd.io/etcd/client/v3"
)

func (jh *GenericHandler) DeleteKey(rw http.ResponseWriter, r *http.Request) {
	requestMeta, ok := r.Context().Value(META_KEY).(request.RequestMeta)
	if !ok {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	client, err := etcd.NewClient(requestMeta.Backend.Endpoints(), etcd.WithAuth(requestMeta.User, requestMeta.Pass))
	if err != nil {
		if err == rpctypes.ErrAuthFailed {
			rw.WriteHeader(http.StatusForbidden)
			return
		}

		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	defer jh.closeEtcdClient(client)

	reqDataDecoded := request.DeleteKeyRequest{}
	err = request.DecodeJSON(rw, r, &reqDataDecoded)
	if err != nil || reqDataDecoded.Key == "" || (reqDataDecoded.IsDirectory && strings.Trim(reqDataDecoded.Key, "/") == "") {
		response.WriteError(rw, http.StatusBadRequest, "invalid_request", "a non-empty, non-root deletion target is required")
		return
	}

	var resp *clientv3.DeleteResponse

	// Delete with a prefix if it is a directory
	if reqDataDecoded.IsDirectory {
		prefix := reqDataDecoded.Key
		if !strings.HasSuffix(prefix, "/") {
			prefix += "/"
		}
		resp, err = client.Delete(r.Context(), prefix, clientv3.WithPrefix())
	} else {
		resp, err = client.Delete(r.Context(), reqDataDecoded.Key)
	}

	if err != nil {
		if err == rpctypes.ErrAuthFailed {
			rw.WriteHeader(http.StatusForbidden)
			return
		}

		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	responseBytes, err := json.Marshal(response.UpdateKeyResponse{
		Revision: resp.Header.Revision,
	})

	if err != nil {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	rw.Header().Add("Content-Type", "application/json")
	rw.WriteHeader(http.StatusOK)
	rw.Write(responseBytes)
}

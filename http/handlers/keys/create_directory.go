package keys

import (
	"encoding/json"
	"net/http"

	"github.com/srimaln91/etcd-adminer/filetree"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	"github.com/srimaln91/etcd-adminer/internal/keyspace"
	"go.etcd.io/etcd/api/v3/v3rpc/rpctypes"
)

func (jh *Handler) CreateDirectory(rw http.ResponseWriter, r *http.Request) {

	requestMeta, ok := request.Meta(r.Context())
	if !ok {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	reqDataDecoded := request.CreateDirectoryRequest{}
	err := request.DecodeJSON(rw, r, &reqDataDecoded)
	if err != nil || reqDataDecoded.Path == "" {
		response.WriteError(rw, http.StatusBadRequest, "invalid_request", "a non-empty path and valid JSON object are required")
		return
	}

	keys, err := keyspace.ReadForUser(r.Context(), requestMeta.Backend, requestMeta.User, requestMeta.Pass)
	if err != nil {
		if err == rpctypes.ErrAuthFailed {
			rw.WriteHeader(http.StatusForbidden)
			return
		}

		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	// Create filetree by fetching keys from ETCD
	fileTree := filetree.NewFileTree("/")

	for _, k := range keys.Kvs {
		fileTree.AddKey(string(k.Key), false, false)
	}

	// Add virtual directory
	fileTree.AddKey(reqDataDecoded.Path, reqDataDecoded.IsDirectory, true)

	respData, err := json.Marshal(fileTree.Root)
	if err != nil {
		jh.Logger.Error(r.Context(), err.Error())
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	rw.Header().Add("Content-Type", "application/json")
	rw.WriteHeader(http.StatusOK)
	rw.Write(respData)

}

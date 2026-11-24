package keys

import (
	"encoding/json"
	"net/http"

	"github.com/srimaln91/etcd-adminer/filetree"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/internal/keyspace"
	"go.etcd.io/etcd/api/v3/v3rpc/rpctypes"
)

func (jh *Handler) GetKeys(rw http.ResponseWriter, r *http.Request) {
	rw.Header().Set("Deprecation", "true")
	rw.Header().Set("Link", `</api/v1/keys>; rel="successor-version"`)

	requestMeta, ok := request.Meta(r.Context())
	if !ok {
		rw.WriteHeader(http.StatusInternalServerError)
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

	fileTree := filetree.NewFileTree("/")

	for _, k := range keys.Kvs {
		fileTree.AddKey(string(k.Key), false, false)
	}

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

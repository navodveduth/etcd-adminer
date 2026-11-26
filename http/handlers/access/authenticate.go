package access

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/srimaln91/etcd-adminer/http/request"
	httpresponse "github.com/srimaln91/etcd-adminer/http/response"
	"github.com/srimaln91/etcd-adminer/internal/browsersession"
)

func (jh *Handler) Authenticate(rw http.ResponseWriter, r *http.Request) {
	rw.Header().Set("Cache-Control", "no-store")
	var options struct {
		Profile  string `json:"profile"`
		Remember bool   `json:"remember"`
	}
	if r.Body != nil && r.ContentLength != 0 {
		decoder := json.NewDecoder(http.MaxBytesReader(rw, r.Body, 16384))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&options); err != nil {
			http.Error(rw, "invalid authentication options", http.StatusBadRequest)
			return
		}
	}
	if options.Remember && (strings.TrimSpace(options.Profile) == "" || len(options.Profile) > 512) {
		http.Error(rw, "a profile name of at most 512 bytes is required", http.StatusBadRequest)
		return
	}

	requestMeta, ok := request.Meta(r.Context())
	if !ok {
		rw.WriteHeader(http.StatusInternalServerError)
		jh.Logger.Error(r.Context(), "invalid request meta", requestMeta)
		return
	}

	client, err := requestMeta.Backend.NewClient(requestMeta.User, requestMeta.Pass)
	if err != nil {
		httpresponse.WriteRPCError(rw, err)
		jh.Logger.Error(r.Context(), err.Error())
		return
	}

	defer jh.CloseEtcdClient(client)

	_, err = client.Authenticate(r.Context(), requestMeta.User, requestMeta.Pass)
	if err != nil {
		httpresponse.WriteRPCError(rw, err)
		jh.Logger.Error(r.Context(), err.Error())
		return
	}

	response := struct {
		Authenticated   bool                       `json:"authenticated"`
		CreateAt        time.Time                  `json:"created_at"`
		Session         *browsersession.Connection `json:"session,omitempty"`
		RememberMessage string                     `json:"rememberMessage,omitempty"`
	}{
		Authenticated: true,
		CreateAt:      time.Now(),
	}
	if options.Remember {
		if jh.Sessions == nil || !jh.Sessions.Available(r) {
			response.RememberMessage = "Remembered login requires HTTPS. This connection lasts only until the page closes or reloads."
		} else {
			if !jh.Sessions.OriginAllowed(r) {
				http.Error(rw, "same browser origin required for remembered login", http.StatusForbidden)
				return
			}
			info, err := jh.Sessions.Issue(rw, r, browsersession.Credentials{Profile: options.Profile, Backend: requestMeta.Backend.Name(), User: requestMeta.User, Password: requestMeta.Pass})
			if err != nil {
				http.Error(rw, "could not create remembered session; disconnect an unused session or retry later", http.StatusTooManyRequests)
				return
			}
			response.Session = &info
		}
	} else if options.Profile != "" && jh.Sessions != nil {
		jh.Sessions.ForgetProfile(rw, r, options.Profile)
	}

	respData, err := json.Marshal(response)
	if err != nil {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	rw.Header().Add("Content-Type", "application/json")
	rw.WriteHeader(http.StatusOK)
	rw.Write(respData)

}

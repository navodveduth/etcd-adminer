package middlewares

import (
	"context"
	"errors"
	"net/http"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/handlers"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
)

type requestValidateMiddleware struct {
	backendProvider *etcd.BackEndProvider
}

var ErrCredentialsNotProvided = errors.New("credentials are not provided")
var ErrEndpointsNotProvided = errors.New("endpoints are not provided")
var ErrAddressNotParseable = errors.New("can not parse ETCD endpoint address")

func NewRequestValidateMiddleware(backendProvider *etcd.BackEndProvider) *requestValidateMiddleware {
	return &requestValidateMiddleware{
		backendProvider: backendProvider,
	}
}

func (rvm *requestValidateMiddleware) getRequestMeta(r *http.Request) (meta request.RequestMeta, err error) {
	user, pass, ok := r.BasicAuth()
	if !ok {
		return meta, ErrCredentialsNotProvided
	}

	meta.User = user
	meta.Pass = pass

	backend := r.Header.Get("X-Backend")
	if backend == "" {
		return meta, errors.New("backend is not provided")
	}

	meta.Backend, err = rvm.backendProvider.GetBackend(backend)
	if err != nil {
		return meta, err
	}

	return meta, err
}

func (rvm *requestValidateMiddleware) ValidateRequest(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		meta, err := rvm.getRequestMeta(r)
		if err != nil {
			switch {
			case errors.Is(err, ErrCredentialsNotProvided):
				w.Header().Set("WWW-Authenticate", `Basic realm="etcd-adminer"`)
				response.WriteError(w, http.StatusUnauthorized, "unauthenticated", "credentials are required")
			case errors.Is(err, etcd.ErrBackendNotFound):
				response.WriteError(w, http.StatusBadRequest, "invalid_backend", "unknown backend")
			default:
				response.WriteError(w, http.StatusBadRequest, "invalid_request", "backend is required")
			}
			return
		}

		// Attach request metadata to the Http request. So handlers can take it from the context
		modifiedReq := r.WithContext(context.WithValue(r.Context(), handlers.META_KEY, meta))

		// Call the next handler
		next.ServeHTTP(w, modifiedReq)
	})
}

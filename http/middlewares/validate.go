package middlewares

import (
	"errors"
	"net/http"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	"github.com/srimaln91/etcd-adminer/internal/browsersession"
)

type requestValidateMiddleware struct {
	backendProvider *etcd.BackEndProvider
	sessions        *browsersession.Manager
}

type sessionResponse struct {
	http.ResponseWriter
	revoke func()
}

func (w *sessionResponse) WriteHeader(status int) {
	if status == http.StatusUnauthorized {
		w.revoke()
	}
	w.ResponseWriter.WriteHeader(status)
}
func (w *sessionResponse) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
func (w *sessionResponse) Unwrap() http.ResponseWriter { return w.ResponseWriter }

var ErrCredentialsNotProvided = errors.New("credentials are not provided")
var ErrEndpointsNotProvided = errors.New("endpoints are not provided")
var ErrAddressNotParseable = errors.New("can not parse ETCD endpoint address")
var ErrSessionOrigin = errors.New("cookie authentication requires a same-origin mutation")

func NewRequestValidateMiddleware(backendProvider *etcd.BackEndProvider, sessions ...*browsersession.Manager) *requestValidateMiddleware {
	result := &requestValidateMiddleware{
		backendProvider: backendProvider,
	}
	if len(sessions) != 0 {
		result.sessions = sessions[0]
	}
	return result
}

func (rvm *requestValidateMiddleware) getRequestMeta(r *http.Request) (meta request.RequestMeta, err error) {
	user, pass, ok := r.BasicAuth()
	if !ok {
		if r.Header.Get("Authorization") != "" || rvm.sessions == nil {
			return meta, ErrCredentialsNotProvided
		}
		credentials, valid := rvm.sessions.Resolve(r, r.Header.Get("X-Connection-ID"))
		if !valid || credentials.Backend != r.Header.Get("X-Backend") {
			return meta, ErrCredentialsNotProvided
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions && !rvm.sessions.OriginAllowed(r) {
			return meta, ErrSessionOrigin
		}
		user, pass = credentials.User, credentials.Password
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
			case errors.Is(err, ErrSessionOrigin):
				response.WriteError(w, http.StatusForbidden, "invalid_origin", "cookie-authenticated mutations require the exact browser origin")
			case errors.Is(err, ErrCredentialsNotProvided):
				if r.Header.Get("X-Connection-ID") == "" {
					w.Header().Set("WWW-Authenticate", `Basic realm="etcd-adminer"`)
				}
				response.WriteError(w, http.StatusUnauthorized, "unauthenticated", "credentials are required")
			case errors.Is(err, etcd.ErrBackendNotFound):
				response.WriteError(w, http.StatusBadRequest, "invalid_backend", "unknown backend")
			default:
				response.WriteError(w, http.StatusBadRequest, "invalid_request", "backend is required")
			}
			return
		}

		// Attach request metadata to the Http request. So handlers can take it from the context
		modifiedReq := r.WithContext(request.WithMeta(r.Context(), meta))
		if _, _, basic := r.BasicAuth(); !basic && rvm.sessions != nil {
			w = &sessionResponse{ResponseWriter: w, revoke: func() { rvm.sessions.Revoke(r, r.Header.Get("X-Connection-ID")) }}
		}

		// Call the next handler
		next.ServeHTTP(w, modifiedReq)
	})
}

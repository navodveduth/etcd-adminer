package response

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"go.etcd.io/etcd/api/v3/v3rpc/rpctypes"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// WriteError returns a stable, non-secret-bearing API error.
func WriteError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}{code, message})
}

// WriteRPCError maps upstream failures without exposing transport details/secrets.
func WriteRPCError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, rpctypes.ErrAuthFailed), status.Code(err) == codes.Unauthenticated:
		WriteError(w, http.StatusUnauthorized, "unauthenticated", "authentication failed")
	case errors.Is(err, rpctypes.ErrPermissionDenied), status.Code(err) == codes.PermissionDenied:
		WriteError(w, http.StatusForbidden, "forbidden", "permission denied")
	case errors.Is(err, rpctypes.ErrCompacted):
		WriteError(w, http.StatusConflict, "compacted_revision", "the requested revision was compacted; refresh and retry")
	case errors.Is(err, context.DeadlineExceeded), status.Code(err) == codes.DeadlineExceeded:
		WriteError(w, http.StatusGatewayTimeout, "timeout", "etcd request timed out")
	case errors.Is(err, context.Canceled), status.Code(err) == codes.Canceled:
		WriteError(w, http.StatusRequestTimeout, "cancelled", "request cancelled")
	case status.Code(err) == codes.Unavailable:
		WriteError(w, http.StatusServiceUnavailable, "unavailable", "etcd is unavailable")
	case status.Code(err) == codes.InvalidArgument:
		WriteError(w, http.StatusBadRequest, "invalid_request", "etcd rejected the request")
	default:
		WriteError(w, http.StatusInternalServerError, "internal_error", "etcd operation failed")
	}
}

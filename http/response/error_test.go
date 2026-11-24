package response

import (
	"context"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"go.etcd.io/etcd/api/v3/v3rpc/rpctypes"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestWriteRPCError(t *testing.T) {
	for _, tc := range []struct {
		err    error
		status int
		code   string
	}{
		{rpctypes.ErrAuthFailed, 401, "unauthenticated"},
		{rpctypes.ErrPermissionDenied, 403, "forbidden"},
		{rpctypes.ErrCompacted, 409, "compacted_revision"},
		{fmt.Errorf("wrapped: %w", context.DeadlineExceeded), 504, "timeout"},
		{status.Error(codes.Unavailable, "secret endpoint"), 503, "unavailable"},
	} {
		w := httptest.NewRecorder()
		WriteRPCError(w, tc.err)
		if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.code) || strings.Contains(w.Body.String(), "secret") {
			t.Fatalf("unexpected response: %d %s", w.Code, w.Body.String())
		}
	}
}

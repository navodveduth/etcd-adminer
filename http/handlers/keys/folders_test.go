package keys

import (
	"context"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/srimaln91/etcd-adminer/http/request"
)

func TestFolderValidationBeforeBackendAccess(t *testing.T) {
	handler := &Handler{}
	for _, query := range []string{"limit=0", "limit=-1", "limit=201", "limit=oops", "prefix=" + url.QueryEscape(strings.Repeat("x", 8193))} {
		t.Run(query[:min(len(query), 40)], func(t *testing.T) {
			r := httptest.NewRequest("GET", "/api/v1/folders?"+query, nil)
			r = r.WithContext(request.WithMeta(context.Background(), request.RequestMeta{User: "test"}))
			w := httptest.NewRecorder()
			handler.ListFolder(w, r)
			if w.Code != 400 {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
		})
	}
	w := httptest.NewRecorder()
	handler.ListFolder(w, httptest.NewRequest("GET", "/api/v1/folders", nil))
	if w.Code != 500 {
		t.Fatalf("missing metadata: %d", w.Code)
	}
}

package watch

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWatchLimitsAreReleased(t *testing.T) {
	handler := &Handler{}
	principal := watchPrincipal{"backend", "alice"}
	one, ok := handler.reserveWatch(principal)
	if !ok {
		t.Fatal("first watch denied")
	}
	two, ok := handler.reserveWatch(principal)
	if !ok {
		t.Fatal("second watch denied")
	}
	if _, ok := handler.reserveWatch(principal); ok {
		t.Fatal("per-principal limit not enforced")
	}
	one()
	two()
	if handler.watchCount != 0 || len(handler.watches) != 0 {
		t.Fatal("watch resources retained")
	}
}

func TestWatchFrameIsAtomicAndBounded(t *testing.T) {
	w := httptest.NewRecorder()
	if err := sendWatchFrame(w, "changes", 9007199254740993, map[string]string{"revision": "9007199254740993"}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(w.Body.String(), "id: 9007199254740993\n") || !strings.HasSuffix(w.Body.String(), "\n\n") {
		t.Fatalf("invalid frame: %q", w.Body.String())
	}
	if err := sendWatchFrame(httptest.NewRecorder(), "changes", 1, strings.Repeat("x", watchMessageBytes+1)); err != errWatchMessageTooLarge {
		t.Fatalf("unbounded frame accepted: %v", err)
	}
}

func TestWatchRejectsAmbiguousQueries(t *testing.T) {
	for _, query := range []string{"", "?key=/a&mode=invalid", "?key=/a&mode=exact&afterRevision=-1", "?key=/a&mode=exact&afterRevision=01"} {
		w := httptest.NewRecorder()
		(&Handler{}).Watch(w, httptest.NewRequest("GET", "/api/v1/watch"+query, nil))
		if w.Code != 400 {
			t.Fatalf("query %q returned %d", query, w.Code)
		}
	}
}

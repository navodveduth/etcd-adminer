package router

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSPARoutingAndCaching(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "assets"), 0755); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{"index.html": "<html>app</html>", "assets/app-hash.js": "export default 1"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	handler := spaHandler{staticPath: root, indexPath: "index.html"}
	for _, tc := range []struct {
		path        string
		status      int
		cache, body string
	}{
		{"/keys/deep", 200, "no-cache", "<html>app</html>"},
		{"/assets/app-hash.js", 200, "public, max-age=31536000, immutable", "export default 1"},
		{"/assets/missing.js", 404, "", "404"},
		{"/api/missing", 404, "", `"code":"not_found"`},
	} {
		t.Run(tc.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest("GET", tc.path, nil))
			if w.Code != tc.status || w.Header().Get("Cache-Control") != tc.cache || !strings.Contains(w.Body.String(), tc.body) {
				t.Fatalf("unexpected response: %d %v %s", w.Code, w.Header(), w.Body.String())
			}
		})
	}
}

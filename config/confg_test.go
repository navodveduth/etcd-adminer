package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPublicOriginValidation(t *testing.T) {
	for _, tc := range []struct {
		origin string
		valid  bool
	}{
		{"https://admin.example", true}, {"http://localhost:8080", true},
		{"null", false}, {"*", false}, {"https://admin.example/", false},
		{"https://admin.example/path", false}, {"https://user:pass@admin.example", false},
		{"https://admin.example?query=value", false},
	} {
		t.Run(tc.origin, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "config.yaml")
			if err := os.WriteFile(path, []byte("http:\n  publicOrigin: \""+tc.origin+"\"\n"), 0600); err != nil {
				t.Fatal(err)
			}
			_, err := Parse(path)
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v, error=%v", tc.valid, err)
			}
		})
	}
}

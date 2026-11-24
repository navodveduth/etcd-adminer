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

func TestTLSPathsAreRelativeToConfiguration(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "config.yaml")
	data := "etcd:\n- name: secure\n  endpoints: [https://localhost:2379]\n  tls:\n    enabled: true\n    caFile: certs/ca.pem\n    certFile: certs/client.pem\n    keyFile: certs/client-key.pem\n"
	if err := os.WriteFile(path, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	config, err := Parse(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := config.ETCD[0].TLS.CAFile; got != filepath.Join(directory, "certs/ca.pem") {
		t.Fatalf("CA path = %q", got)
	}
}

func TestRejectUnknownTLSOptionsAndMultipleDocuments(t *testing.T) {
	for _, data := range []string{
		"etcd:\n- tls:\n    insecureSkipVerify: true\n",
		"http:\n  port: 8080\n---\nhttp:\n  port: 9090\n",
	} {
		path := filepath.Join(t.TempDir(), "config.yaml")
		if err := os.WriteFile(path, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := Parse(path); err == nil {
			t.Fatal("accepted an ambiguous or insecure configuration")
		}
	}
}

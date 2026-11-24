package etcd

import (
	"crypto/tls"
	"crypto/x509"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/srimaln91/etcd-adminer/internal/testcerts"
)

func TestTLSOptionsAndMutualTLS(t *testing.T) {
	paths, err := testcerts.Generate(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	options := TLSOptions{Enabled: true, CAFile: paths.CA, CertFile: paths.ClientCert, KeyFile: paths.ClientKey}
	clientTLS, err := options.Load()
	if err != nil {
		t.Fatal(err)
	}
	serverCertificate, err := tls.LoadX509KeyPair(paths.ServerCert, paths.ServerKey)
	if err != nil {
		t.Fatal(err)
	}
	ca, err := os.ReadFile(paths.CA)
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(ca) {
		t.Fatal("invalid generated CA")
	}
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	server.TLS = &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{serverCertificate}, ClientCAs: pool, ClientAuth: tls.RequireAndVerifyClientCert}
	server.StartTLS()
	defer server.Close()
	request := func(config *tls.Config) error {
		transport := &http.Transport{TLSClientConfig: config}
		defer transport.CloseIdleConnections()
		client := &http.Client{Transport: transport, Timeout: time.Second}
		response, err := client.Get(server.URL)
		if err != nil {
			return err
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusNoContent {
			t.Fatalf("unexpected status: %d", response.StatusCode)
		}
		return nil
	}
	if err := request(clientTLS); err != nil {
		t.Fatal(err)
	}
	wrongName := clientTLS.Clone()
	wrongName.ServerName = "not-the-server.example"
	if err := request(wrongName); err == nil {
		t.Fatal("accepted a certificate for the wrong hostname")
	}
	noCertificate := clientTLS.Clone()
	noCertificate.Certificates = nil
	if err := request(noCertificate); err == nil {
		t.Fatal("connected without a required client certificate")
	}
	untrusted := clientTLS.Clone()
	untrusted.RootCAs = x509.NewCertPool()
	if err := request(untrusted); err == nil {
		t.Fatal("accepted an untrusted server CA")
	}
}

func TestTLSRejectsMisconfigurationAndIdentityOverride(t *testing.T) {
	directory := t.TempDir()
	badCA := filepath.Join(directory, "bad-ca.pem")
	if err := os.WriteFile(badCA, []byte("not a certificate"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, options := range []TLSOptions{
		{CAFile: badCA}, {Enabled: true, CAFile: badCA},
		{Enabled: true, CertFile: "missing.pem"}, {Enabled: true, KeyFile: "missing.key"},
		{Enabled: true, CertFile: badCA, KeyFile: badCA},
	} {
		if _, err := options.Load(); err == nil {
			t.Fatalf("accepted invalid options: %+v", options)
		}
	}
	paths, err := testcerts.Generate(t.TempDir(), "root")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := (TLSOptions{Enabled: true, CAFile: paths.CA, CertFile: paths.ClientCert, KeyFile: paths.ClientKey}).Load(); err == nil {
		t.Fatal("accepted a shared certificate that overrides caller identity")
	}
	for _, config := range []*tls.Config{
		{InsecureSkipVerify: true}, // explicitly verify insecure options are rejected
		{MinVersion: tls.VersionTLS10},
	} {
		if _, err := NewClient([]string{"https://localhost:2379"}, WithTLS(config)); err == nil {
			t.Fatal("accepted insecure TLS configuration")
		}
	}
}

func TestRejectTransportDowngrade(t *testing.T) {
	for _, endpoints := range [][]string{
		{"https://localhost:2379", "http://localhost:2379"},
		{"https://localhost:2379", "localhost:2379"},
		{"http://user:secret@localhost:2379"}, {"http://localhost:2379/path"},
	} {
		if client, err := NewClient(endpoints); err == nil {
			_ = client.Close()
			t.Fatalf("accepted invalid endpoint set: %q", endpoints)
		}
	}
	client := &Client{tlsConfig: &tls.Config{MinVersion: tls.VersionTLS12}}
	if _, err := client.Status(t.Context(), "http://member:2379"); err == nil {
		t.Fatal("status allowed a discovered plaintext endpoint")
	}
}

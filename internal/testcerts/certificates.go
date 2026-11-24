// Package testcerts generates short-lived certificates for isolated tests only.
package testcerts

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

type Paths struct{ CA, ServerCert, ServerKey, ClientCert, ClientKey string }

// Generate never overwrites existing files; all material is private to its owner.
// Empty clientCN deliberately avoids etcd's certificate-CN user impersonation.
func Generate(directory, clientCN string) (Paths, error) {
	paths := Paths{
		CA: filepath.Join(directory, "ca.pem"), ServerCert: filepath.Join(directory, "server.pem"),
		ServerKey: filepath.Join(directory, "server-key.pem"), ClientCert: filepath.Join(directory, "client.pem"),
		ClientKey: filepath.Join(directory, "client-key.pem"),
	}
	caKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return Paths{}, err
	}
	validFrom, validUntil := time.Now().Add(-time.Hour), time.Now().Add(24*time.Hour)
	ca := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "etcd-adminer-test-ca"},
		NotBefore: validFrom, NotAfter: validUntil, IsCA: true, BasicConstraintsValid: true,
		KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
	}
	caDER, err := x509.CreateCertificate(rand.Reader, ca, ca, &caKey.PublicKey, caKey)
	if err != nil {
		return Paths{}, err
	}
	if err := writePEM(paths.CA, "CERTIFICATE", caDER); err != nil {
		return Paths{}, err
	}
	for index, identity := range []struct {
		cert, key, commonName string
		server                bool
	}{
		{paths.ServerCert, paths.ServerKey, "localhost", true},
		{paths.ClientCert, paths.ClientKey, clientCN, false},
	} {
		key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			return Paths{}, err
		}
		certificate := &x509.Certificate{
			SerialNumber: big.NewInt(int64(index + 2)), Subject: pkix.Name{CommonName: identity.commonName},
			NotBefore: validFrom, NotAfter: validUntil, KeyUsage: x509.KeyUsageDigitalSignature,
			ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		}
		if identity.server {
			certificate.DNSNames = []string{"localhost"}
			certificate.IPAddresses = []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")}
			certificate.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}
		}
		der, err := x509.CreateCertificate(rand.Reader, certificate, ca, &key.PublicKey, caKey)
		if err != nil {
			return Paths{}, err
		}
		if err := writePEM(identity.cert, "CERTIFICATE", der); err != nil {
			return Paths{}, err
		}
		keyDER, err := x509.MarshalPKCS8PrivateKey(key)
		if err != nil {
			return Paths{}, err
		}
		if err := writePEM(identity.key, "PRIVATE KEY", keyDER); err != nil {
			return Paths{}, err
		}
	}
	return paths, nil
}

func writePEM(path, kind string, bytes []byte) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	if err := pem.Encode(file, &pem.Block{Type: kind, Bytes: bytes}); err != nil {
		_ = file.Close()
		return err
	}
	return file.Close()
}

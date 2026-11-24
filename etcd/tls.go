package etcd

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
)

// TLSOptions configures upstream TLS. Certificate verification cannot be disabled.
type TLSOptions struct {
	Enabled    bool   `yaml:"enabled"`
	CAFile     string `yaml:"caFile"`
	CertFile   string `yaml:"certFile"`
	KeyFile    string `yaml:"keyFile"`
	ServerName string `yaml:"serverName"`
}

func (options TLSOptions) Load() (*tls.Config, error) {
	if !options.Enabled {
		if options.CAFile != "" || options.CertFile != "" || options.KeyFile != "" || options.ServerName != "" {
			return nil, errors.New("TLS settings require tls.enabled: true")
		}
		return nil, nil
	}
	if (options.CertFile == "") != (options.KeyFile == "") {
		return nil, errors.New("TLS client certificate and key must be configured together")
	}
	config := &tls.Config{MinVersion: tls.VersionTLS12, ServerName: options.ServerName}
	if options.CAFile != "" {
		pem, err := os.ReadFile(options.CAFile)
		if err != nil {
			return nil, fmt.Errorf("read TLS CA file: %w", err)
		}
		config.RootCAs = x509.NewCertPool()
		if !config.RootCAs.AppendCertsFromPEM(pem) {
			return nil, errors.New("TLS CA file contains no usable certificates")
		}
	}
	if options.CertFile != "" {
		certificate, err := tls.LoadX509KeyPair(options.CertFile, options.KeyFile)
		if err != nil {
			return nil, fmt.Errorf("load TLS client certificate/key: %w", err)
		}
		config.Certificates = []tls.Certificate{certificate}
	}
	if err := validateTLSConfig(config); err != nil {
		return nil, err
	}
	return config, nil
}

func validateTLSConfig(config *tls.Config) error {
	if config.InsecureSkipVerify {
		return errors.New("TLS certificate verification cannot be disabled")
	}
	if config.MinVersion == 0 {
		config.MinVersion = tls.VersionTLS12
	}
	if config.MinVersion < tls.VersionTLS12 {
		return errors.New("TLS 1.2 or newer is required")
	}
	for _, certificate := range config.Certificates {
		if len(certificate.Certificate) == 0 {
			return errors.New("empty TLS client certificate")
		}
		leaf, err := x509.ParseCertificate(certificate.Certificate[0])
		if err != nil {
			return fmt.Errorf("parse TLS client certificate: %w", err)
		}
		if leaf.Subject.CommonName != "" {
			// etcd can use a TLS common name instead of the caller's auth token.
			// A shared root/client CN would bypass per-user application RBAC.
			return errors.New("shared TLS client certificates must have an empty common name to preserve username/password RBAC")
		}
	}
	return nil
}

func WithTLS(config *tls.Config) func(*Config) {
	return func(cfg *Config) {
		if config != nil {
			cfg.etcdConfig.TLS = config.Clone()
		}
	}
}

// validateEndpoint rejects ambiguous targets and TLS-to-plaintext downgrade.
func validateEndpoint(endpoint string, requireTLS bool) error {
	if strings.Contains(endpoint, "://") {
		parsed, err := url.Parse(endpoint)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
			return errors.New("etcd endpoint must be an http(s) host:port without credentials, query, or path")
		}
		if requireTLS && parsed.Scheme != "https" {
			return errors.New("TLS backends require https endpoints; plaintext fallback is not allowed")
		}
		endpoint = parsed.Host
	} else if requireTLS {
		return errors.New("TLS backends require explicit https endpoints")
	}
	if host, port, err := net.SplitHostPort(endpoint); err != nil || host == "" || port == "" {
		return errors.New("etcd endpoint must include a host and port")
	}
	return nil
}

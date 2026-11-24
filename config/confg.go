package config

import (
	"bytes"
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/log"
	yaml "gopkg.in/yaml.v3"
)

type Config struct {
	HTTP struct {
		Port         int    `yaml:"port"`
		PublicOrigin string `yaml:"publicOrigin"`
	} `yaml:"http"`
	Logger struct {
		Level log.Level `yaml:"level"`
	} `yaml:"logger"`
	ETCD []struct {
		Name       string
		Endpoints  []string        `yaml:"endpoints"`
		TLS        etcd.TLSOptions `yaml:"tls"`
		SuperAdmin struct {
			UserName string `yaml:"username"`
			Password string `yaml:"password"`
		} `yaml:"superadmin"`
	} `yaml:"etcd"`
}

var AppConfig *Config

func Parse(path string) (*Config, error) {
	file, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	config := new(Config)
	decoder := yaml.NewDecoder(bytes.NewReader(file))
	decoder.KnownFields(true)
	err = decoder.Decode(config)
	if err != nil {
		return nil, err
	}
	var extra interface{}
	if err := decoder.Decode(&extra); err != io.EOF {
		return nil, errors.New("configuration must contain exactly one YAML document")
	}
	if config.HTTP.PublicOrigin != "" {
		origin, err := url.Parse(config.HTTP.PublicOrigin)
		if err != nil || (origin.Scheme != "http" && origin.Scheme != "https") || origin.Host == "" || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
			return nil, errors.New("http.publicOrigin must be an http(s) origin without a path, credentials, query, or fragment")
		}
	}
	resolvePath := func(value string) string {
		if value == "" || filepath.IsAbs(value) {
			return value
		}
		return filepath.Join(filepath.Dir(path), value)
	}
	for index := range config.ETCD {
		tls := &config.ETCD[index].TLS
		tls.CAFile = resolvePath(tls.CAFile)
		tls.CertFile = resolvePath(tls.CertFile)
		tls.KeyFile = resolvePath(tls.KeyFile)
	}

	AppConfig = config
	return config, nil
}

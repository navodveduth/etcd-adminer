package config

import (
	"errors"
	"net/url"
	"os"

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
		Endpoints  []string `yaml:"endpoints"`
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
	err = yaml.Unmarshal(file, config)
	if err != nil {
		return nil, err
	}
	if config.HTTP.PublicOrigin != "" {
		origin, err := url.Parse(config.HTTP.PublicOrigin)
		if err != nil || (origin.Scheme != "http" && origin.Scheme != "https") || origin.Host == "" || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
			return nil, errors.New("http.publicOrigin must be an http(s) origin without a path, credentials, query, or fragment")
		}
	}

	AppConfig = config
	return config, nil
}

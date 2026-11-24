package config

import (
	"os"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestDevelopmentClusterUsesIsolatedLoopbackFixtures(t *testing.T) {
	data, err := os.ReadFile("../docker-compose.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var compose struct {
		Services map[string]struct {
			Image       string            `yaml:"image"`
			Ports       []string          `yaml:"ports"`
			Volumes     []string          `yaml:"volumes"`
			Environment map[string]string `yaml:"environment"`
		} `yaml:"services"`
		Volumes map[string]interface{} `yaml:"volumes"`
	}
	if err := yaml.Unmarshal(data, &compose); err != nil {
		t.Fatal(err)
	}
	if len(compose.Services) != 3 || len(compose.Volumes) != 3 {
		t.Fatal("expected isolated three-member fixture")
	}
	for name, service := range compose.Services {
		if !strings.Contains(service.Image, "@sha256:") || strings.Contains(service.Image, ":latest") {
			t.Fatalf("unpinned image for %s", name)
		}
		if len(service.Ports) != 1 || !strings.HasPrefix(service.Ports[0], "127.0.0.1:") || !strings.HasSuffix(service.Ports[0], ":2379") {
			t.Fatalf("non-loopback or peer exposure for %s: %v", name, service.Ports)
		}
		if len(service.Volumes) != 1 || service.Volumes[0] != name+"-data:/etcd-data" {
			t.Fatalf("unexpected data mount for %s: %v", name, service.Volumes)
		}
		if service.Environment["ETCD_LISTEN_PEER_URLS"] != "http://0.0.0.0:2380" {
			t.Fatalf("missing merged environment for %s", name)
		}
	}
}

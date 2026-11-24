package main

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStartupErrorsExitNonzeroWithoutExposingCredentials(t *testing.T) {
	binary := filepath.Join(t.TempDir(), "etcd-adminer")
	buildContext, cancelBuild := context.WithTimeout(t.Context(), time.Minute)
	defer cancelBuild()
	build := exec.CommandContext(buildContext, "go", "build", "-o", binary, ".")
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build failed: %v\n%s", err, output)
	}
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	data := "logger:\n  level: INFO\netcd:\n- name: invalid\n  endpoints: [http://localhost:2379]\n  superadmin:\n    username: root\n    password: never-log-this-secret\n    passwordEnv: AMBIGUOUS_PASSWORD\n"
	if err := os.WriteFile(configPath, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{configPath, filepath.Join(t.TempDir(), "missing.yaml")} {
		ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
		output, err := exec.CommandContext(ctx, binary, "--config", path).CombinedOutput()
		cancel()
		var exit *exec.ExitError
		if !errors.As(err, &exit) || exit.ExitCode() != 1 {
			t.Fatalf("startup status: %v\n%s", err, output)
		}
		if strings.Contains(string(output), "never-log-this-secret") || strings.Contains(string(output), "panic:") {
			t.Fatalf("unsafe startup diagnostics: %s", output)
		}
	}
}

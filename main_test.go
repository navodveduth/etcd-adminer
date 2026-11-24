package main

import (
	"bufio"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStartupSucceedsWithoutEtcdOrAdminCredentials(t *testing.T) {
	binary := filepath.Join(t.TempDir(), "etcd-adminer")
	buildContext, cancel := context.WithTimeout(t.Context(), time.Minute)
	defer cancel()
	if output, err := exec.CommandContext(buildContext, "go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		t.Fatalf("build failed: %v\n%s", err, output)
	}
	for _, legacy := range []bool{false, true} {
		t.Run(map[bool]string{false: "no-credentials", true: "legacy-credentials-ignored"}[legacy], func(t *testing.T) {
			data := "http:\n  port: 0\nlogger:\n  level: INFO\netcd:\n- name: offline\n  endpoints: [http://127.0.0.1:1]\n"
			if legacy {
				data += "  superadmin:\n    username: root\n    password: never-log-this-secret\n    passwordFile: /nonexistent-adminer-secret\n    passwordEnv: UNSET_ADMINER_LEGACY_PASSWORD\n"
			}
			path := filepath.Join(t.TempDir(), "config.yaml")
			if err := os.WriteFile(path, []byte(data), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, done := context.WithTimeout(t.Context(), 10*time.Second)
			defer done()
			command := exec.CommandContext(ctx, binary, "--config", path)
			stdout, err := command.StdoutPipe()
			if err != nil {
				t.Fatal(err)
			}
			if err := command.Start(); err != nil {
				t.Fatal(err)
			}
			defer command.Process.Kill()
			lines := make(chan string, 16)
			go func() {
				defer close(lines)
				scanner := bufio.NewScanner(stdout)
				for scanner.Scan() {
					lines <- scanner.Text()
				}
			}()
			for {
				select {
				case line, open := <-lines:
					if !open {
						t.Fatal("server stopped before accepting browser connections")
					}
					if strings.Contains(line, "never-log-this-secret") {
						t.Fatal("startup leaked legacy credentials")
					}
					if strings.Contains(line, "HTTP server listening") {
						if err := command.Process.Signal(os.Interrupt); err != nil {
							t.Fatal(err)
						}
						if err := command.Wait(); err != nil {
							t.Fatalf("graceful shutdown failed: %v", err)
						}
						return
					}
				case <-ctx.Done():
					t.Fatal("startup required an available etcd cluster or credentials")
				}
			}
		})
	}
}

func TestStartupErrorsExitNonzeroWithoutExposingCredentials(t *testing.T) {
	binary := filepath.Join(t.TempDir(), "etcd-adminer")
	buildContext, cancelBuild := context.WithTimeout(t.Context(), time.Minute)
	defer cancelBuild()
	build := exec.CommandContext(buildContext, "go", "build", "-o", binary, ".")
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build failed: %v\n%s", err, output)
	}
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	data := "logger:\n  level: INFO\netcd:\n- name: invalid\n  endpoints: [file:///invalid-etcd-endpoint]\n  superadmin:\n    username: root\n    password: never-log-this-secret\n    passwordEnv: AMBIGUOUS_PASSWORD\n"
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

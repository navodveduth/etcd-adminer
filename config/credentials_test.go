package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPasswordSources(t *testing.T) {
	t.Setenv("ETCD_ADMINER_TEST_PASSWORD", " env secret ")
	file := filepath.Join(t.TempDir(), "password")
	if err := os.WriteFile(file, []byte(" file secret \r\n"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		credentials AdminCredentials
		want        string
	}{
		{AdminCredentials{Password: " literal secret "}, " literal secret "},
		{AdminCredentials{PasswordEnv: "ETCD_ADMINER_TEST_PASSWORD"}, " env secret "},
		{AdminCredentials{PasswordFile: file}, " file secret "},
	} {
		got, err := tc.credentials.ResolvePassword()
		if err != nil || got != tc.want {
			t.Fatal("password bytes were not preserved or source failed")
		}
	}
}

func TestPasswordSourceErrorsDoNotExposeSecrets(t *testing.T) {
	t.Setenv("ETCD_ADMINER_TEST_MISSING_PASSWORD", "")
	for _, credentials := range []AdminCredentials{
		{}, {Password: "secret-value", PasswordEnv: "MISSING"},
		{PasswordEnv: "ETCD_ADMINER_TEST_MISSING_PASSWORD"}, {PasswordFile: filepath.Join(t.TempDir(), "missing")},
	} {
		_, err := credentials.ResolvePassword()
		if err == nil || strings.Contains(err.Error(), "secret-value") {
			t.Fatalf("unsafe/missing error: %v", err)
		}
	}
	file := filepath.Join(t.TempDir(), "large")
	if err := os.WriteFile(file, []byte(strings.Repeat("x", maxPasswordBytes+1)), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := (AdminCredentials{PasswordFile: file}).ResolvePassword(); err == nil {
		t.Fatal("unbounded password file accepted")
	}
}

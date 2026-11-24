package config

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

const maxPasswordBytes = 64 * 1024

// AdminCredentials is retained only to parse older configuration files.
// Startup ignores its secret sources; connections authenticate as their caller.
type AdminCredentials struct {
	UserName     string `yaml:"username"`
	Password     string `yaml:"password"`
	PasswordFile string `yaml:"passwordFile"`
	PasswordEnv  string `yaml:"passwordEnv"`
}

// ResolvePassword accepts exactly one source and never includes its value in errors.
// Deprecated: retained for compatibility; application startup never calls it.
func (credentials AdminCredentials) ResolvePassword() (string, error) {
	sources := 0
	for _, value := range []string{credentials.Password, credentials.PasswordFile, credentials.PasswordEnv} {
		if value != "" {
			sources++
		}
	}
	if sources != 1 {
		return "", errors.New("configure exactly one superadmin password, passwordFile, or passwordEnv")
	}
	password := credentials.Password
	if credentials.PasswordEnv != "" {
		value, present := os.LookupEnv(credentials.PasswordEnv)
		if !present || value == "" {
			return "", errors.New("superadmin password environment variable is missing or empty")
		}
		password = value
	}
	if credentials.PasswordFile != "" {
		file, err := os.Open(credentials.PasswordFile)
		if err != nil {
			return "", fmt.Errorf("open superadmin password file: %w", err)
		}
		defer file.Close()
		data, err := io.ReadAll(io.LimitReader(file, maxPasswordBytes+1))
		if err != nil {
			return "", errors.New("read superadmin password file failed")
		}
		if len(data) > maxPasswordBytes {
			return "", errors.New("superadmin password file exceeds size limit")
		}
		password = string(data)
		if strings.HasSuffix(password, "\r\n") {
			password = strings.TrimSuffix(password, "\r\n")
		} else {
			password = strings.TrimSuffix(password, "\n")
		}
	}
	if password == "" || len(password) > maxPasswordBytes {
		return "", errors.New("superadmin password is empty or exceeds size limit")
	}
	return password, nil
}

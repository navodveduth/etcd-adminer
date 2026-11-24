package handlers

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/srimaln91/etcd-adminer/config"
)

func TestConfigReportsReadOnlyWithoutCredentialSources(t *testing.T) {
	previous := config.AppConfig
	t.Cleanup(func() { config.AppConfig = previous })
	path := filepath.Join(t.TempDir(), "config.yaml")
	data := "http:\n  readOnly: true\netcd:\n- name: local\n  endpoints: [http://localhost:2379]\n  protectedUsers: [managed-user]\n  superadmin:\n    username: root\n    passwordFile: /secrets/privileged-password\n"
	if err := os.WriteFile(path, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := config.Parse(path); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	(&GenericHandler{}).GetConfig(w, httptest.NewRequest("GET", "/api/getconfig", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"readOnly":true`) {
		t.Fatalf("unexpected config: %d %s", w.Code, w.Body.String())
	}
	for _, secret := range []string{"root", "passwordFile", "/secrets", "protectedUsers", "managed-user"} {
		if strings.Contains(w.Body.String(), secret) {
			t.Fatalf("credential source leaked: %s", w.Body.String())
		}
	}
}

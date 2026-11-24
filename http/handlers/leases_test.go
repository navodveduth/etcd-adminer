package handlers

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLeaseIDValidation(t *testing.T) {
	for _, value := range []string{"", "0", "+1", "01", "1.5", "9223372036854775808", "not-an-id"} {
		if _, err := leaseID(value); err == nil {
			t.Fatalf("accepted %q", value)
		}
	}
	for _, value := range []string{"1", "-1", "9223372036854775807"} {
		if _, err := leaseID(value); err != nil {
			t.Fatalf("rejected %q: %v", value, err)
		}
	}
}

func TestLeaseGrantRejectsInvalidTTLBeforeConnecting(t *testing.T) {
	for _, body := range []string{`{}`, `{"ttl":0}`, `{"ttl":-1}`, `{"ttl":604801}`, `{"ttl":1.5}`, `{"ttl":60,"unknown":true}`} {
		r := httptest.NewRequest("POST", "/api/v1/leases", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		(&GenericHandler{}).Leases(w, r)
		if w.Code != 400 {
			t.Fatalf("accepted %s: %d", body, w.Code)
		}
	}
}

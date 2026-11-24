package request

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeJSON(t *testing.T) {
	for _, input := range []string{``, `null`, `[]`, `{"key":"x"} {}`, `{"key":"x","unknown":true}`, `{"value":"` + strings.Repeat("x", MaxBodyBytes) + `"}`} {
		r := httptest.NewRequest("PUT", "/api/keys", strings.NewReader(input))
		r.Header.Set("Content-Type", "application/json")
		var target CreateKeyRequest
		if err := DecodeJSON(httptest.NewRecorder(), r, &target); err == nil {
			t.Fatalf("accepted invalid input of length %d", len(input))
		}
	}
	var target CreateKeyRequest
	r := httptest.NewRequest("PUT", "/api/keys", strings.NewReader(`{"key":"a?&#%","value":""}`))
	r.Header.Set("Content-Type", "application/json")
	if err := DecodeJSON(httptest.NewRecorder(), r, &target); err != nil {
		t.Fatal(err)
	}
	if target.Key != "a?&#%" {
		t.Fatal("key bytes changed")
	}
}

func TestDecodeJSONRejectsFormContentTypes(t *testing.T) {
	for _, contentType := range []string{"", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data"} {
		r := httptest.NewRequest("PUT", "/api/keys", strings.NewReader(`{"key":"secret"}`))
		r.Header.Set("Content-Type", contentType)
		var target CreateKeyRequest
		if err := DecodeJSON(httptest.NewRecorder(), r, &target); err == nil {
			t.Fatalf("accepted %q", contentType)
		}
	}
}

package request

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeJSON(t *testing.T) {
	for _, input := range []string{``, `null`, `[]`, `{"key":"x"} {}`, `{"key":"x","unknown":true}`, `{"value":"` + strings.Repeat("x", MaxBodyBytes) + `"}`} {
		r := httptest.NewRequest("PUT", "/api/keys", strings.NewReader(input))
		var target CreateKeyRequest
		if err := DecodeJSON(httptest.NewRecorder(), r, &target); err == nil {
			t.Fatalf("accepted invalid input of length %d", len(input))
		}
	}
	var target CreateKeyRequest
	r := httptest.NewRequest("PUT", "/api/keys", strings.NewReader(`{"key":"a?&#%","value":""}`))
	if err := DecodeJSON(httptest.NewRecorder(), r, &target); err != nil {
		t.Fatal(err)
	}
	if target.Key != "a?&#%" {
		t.Fatal("key bytes changed")
	}
}

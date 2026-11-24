package response

import (
	"net/http/httptest"
	"testing"
)

func TestDisplayBytesPreservesTextAndBinary(t *testing.T) {
	for _, tc := range []struct {
		value          []byte
		text, encoding string
	}{
		{[]byte("日本語"), "日本語", "utf8"}, {[]byte{255, 0}, "/wA=", "base64"},
	} {
		text, encoding := DisplayBytes(tc.value)
		if text != tc.text || encoding != tc.encoding {
			t.Fatalf("incorrect encoding: %q %q", text, encoding)
		}
	}
}

func TestSharedJSONContractsKeepPrecisionAndNoStore(t *testing.T) {
	w := httptest.NewRecorder()
	WriteJSON(w, KeyPage{Items: []KeySummary{}, Revision: "9007199254740993"})
	if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("Content-Type") != "application/json" {
		t.Fatal("missing private JSON response policy")
	}
	if w.Body.String() != "{\"items\":[],\"revision\":\"9007199254740993\",\"hasMore\":false}\n" {
		t.Fatalf("wire contract changed: %s", w.Body.String())
	}
}

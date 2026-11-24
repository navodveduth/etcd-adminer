package response

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestKeySerializesLargeIntegersAsStrings(t *testing.T) {
	data, err := json.Marshal(Key{ModRevision: 9007199254740993, Lease: 9223372036854775807})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"modRevision":"9007199254740993"`) || !strings.Contains(string(data), `"lease":"9223372036854775807"`) {
		t.Fatalf("unsafe numeric response: %s", data)
	}
}

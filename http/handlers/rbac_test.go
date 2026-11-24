package handlers

import (
	"encoding/base64"
	"testing"
)

func TestPermissionBoundsPreserveExactAndPrefixScopes(t *testing.T) {
	for _, tc := range []struct {
		input permissionInput
		end   string
	}{
		{permissionInput{Access: "read", Scope: "exact", Key: "/app"}, ""},
		{permissionInput{Access: "readwrite", Scope: "prefix", Key: "/app/"}, "/app0"},
		{permissionInput{Access: "write", Scope: "range", Key: "a", RangeEnd: "c"}, "c"},
	} {
		key, end, _, err := permissionBounds(tc.input, false)
		if err != nil || key != tc.input.Key || end != tc.end {
			t.Fatalf("incorrect bounds: %q %q %v", key, end, err)
		}
	}
	for _, input := range []permissionInput{{Access: "root", Scope: "exact", Key: "/"}, {Access: "read", Scope: "prefix"}, {Access: "read", Scope: "range", Key: "z", RangeEnd: "a"}} {
		if _, _, _, err := permissionBounds(input, false); err == nil {
			t.Fatalf("accepted invalid permission: %+v", input)
		}
	}
}

func TestPermissionRevocationPreservesBinaryBounds(t *testing.T) {
	key, end := []byte{0, 255, 1}, []byte{0, 255, 2}
	start, finish, _, err := permissionBounds(permissionInput{KeyBase64: base64.StdEncoding.EncodeToString(key), RangeEndBase64: base64.StdEncoding.EncodeToString(end)}, true)
	if err != nil || start != string(key) || finish != string(end) {
		t.Fatal("binary permission bounds changed")
	}
}

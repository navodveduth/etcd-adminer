package filetree

import "testing"

func TestAddKeyPreservesBytes(t *testing.T) {
	ft := NewFileTree("/")
	for _, key := range []string{"foo", "/foo", "/foo/bar", "foo/bar", "/", "a//b/", "a?&#%", "日本語"} {
		node := ft.AddKey(key, false, false)
		if node.AbsPath != key || node.Type != "file" {
			t.Fatalf("key %q became %+v", key, node)
		}
		if duplicate := ft.AddKey(key, false, false); duplicate != node {
			t.Fatalf("duplicate node for %q", key)
		}
	}
}

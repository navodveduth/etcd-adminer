package request

import (
	"context"
	"testing"
)

func TestMetadataIsTypedAndRequestScoped(t *testing.T) {
	base := context.WithValue(context.Background(), "meta", RequestMeta{User: "unrelated"})
	if _, ok := Meta(base); ok {
		t.Fatal("accepted an unrelated context key")
	}
	first := WithMeta(base, RequestMeta{User: "alice", Pass: "first-request"})
	second := WithMeta(base, RequestMeta{User: "bob", Pass: "second-request"})
	a, ok := Meta(first)
	if !ok || a.User != "alice" {
		t.Fatal("first request lost metadata")
	}
	b, ok := Meta(second)
	if !ok || b.User != "bob" {
		t.Fatal("metadata crossed requests")
	}
	if _, ok := Meta(base); ok {
		t.Fatal("parent context was modified")
	}
}

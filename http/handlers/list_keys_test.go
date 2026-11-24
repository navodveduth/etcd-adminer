package handlers

import (
	"context"
	"reflect"
	"testing"
	"time"

	"go.etcd.io/etcd/api/v3/etcdserverpb"
	"go.etcd.io/etcd/api/v3/mvccpb"
	clientv3 "go.etcd.io/etcd/client/v3"
)

func TestCursorScopeAndIntegrity(t *testing.T) {
	handler, err := NewHTTPHandler(nil)
	if err != nil {
		t.Fatal(err)
	}
	cursor := keyCursor{Backend: "one", User: "alice", Prefix: "/", Limit: 2, Last: []byte("/key"), Revision: 7, Expires: time.Now().Add(time.Minute).Unix()}
	token, err := handler.encodeCursor(cursor, "password")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := handler.decodeCursor(token, "password", cursor); err != nil {
		t.Fatal(err)
	}
	for _, changed := range []keyCursor{
		{Purpose: "export-v1", Backend: cursor.Backend, User: cursor.User, Prefix: cursor.Prefix, Limit: cursor.Limit},
		{Backend: "other", User: cursor.User, Prefix: cursor.Prefix, Limit: cursor.Limit},
		{Backend: cursor.Backend, User: "bob", Prefix: cursor.Prefix, Limit: cursor.Limit},
		{Backend: cursor.Backend, User: cursor.User, Prefix: "/other", Limit: cursor.Limit},
		{Backend: cursor.Backend, User: cursor.User, Prefix: cursor.Prefix, Limit: 3},
	} {
		if _, err := handler.decodeCursor(token, "password", changed); err == nil {
			t.Fatal("accepted a cursor outside its scope")
		}
	}
	if _, err := handler.decodeCursor(token, "changed password", cursor); err == nil {
		t.Fatal("accepted changed credentials")
	}
	if _, err := handler.decodeCursor(token+"tampered", "password", cursor); err == nil {
		t.Fatal("accepted tampered cursor")
	}
	cursor.Expires = time.Now().Add(-time.Minute).Unix()
	expired, err := handler.encodeCursor(cursor, "password")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := handler.decodeCursor(expired, "password", cursor); err == nil {
		t.Fatal("accepted expired cursor")
	}
}

type pageKV struct {
	clientv3.KV
	keys  []string
	calls []clientv3.Op
}

func (f *pageKV) Get(_ context.Context, key string, options ...clientv3.OpOption) (*clientv3.GetResponse, error) {
	op := clientv3.OpGet(key, options...)
	f.calls = append(f.calls, op)
	result := &clientv3.GetResponse{Header: &etcdserverpb.ResponseHeader{Revision: 7}}
	for _, item := range f.keys {
		if item < key || (string(op.RangeBytes()) != "\x00" && item >= string(op.RangeBytes())) {
			continue
		}
		result.Kvs = append(result.Kvs, &mvccpb.KeyValue{Key: []byte(item)})
		if int64(len(result.Kvs)) >= op.Limit() {
			break
		}
	}
	return result, nil
}

func TestReadKeyPageBoundsAndContinuation(t *testing.T) {
	kv := &pageKV{keys: []string{"a", "a\x00", "a/child", "b", "c"}}
	ranges := []keyRange{{"a", "b"}, {"c", "d"}}
	first, err := readKeyPage(context.Background(), kv, ranges, "", 0, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Kvs) != 2 || !first.More || string(first.Kvs[1].Key) != "a\x00" {
		t.Fatalf("unexpected first page: %+v", first)
	}
	second, err := readKeyPage(context.Background(), kv, ranges, string(first.Kvs[1].Key), 7, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Kvs) != 2 || second.More || string(second.Kvs[0].Key) != "a/child" || string(second.Kvs[1].Key) != "c" {
		t.Fatalf("unexpected second page: %+v", second)
	}
	for index, call := range kv.calls {
		if call.Limit() < 1 || call.Limit() > 3 || !call.IsKeysOnly() {
			t.Fatal("unbounded read or value fetch")
		}
		if index > 0 && call.Rev() != 7 {
			t.Fatal("revision was not pinned")
		}
	}
}

func TestIntersectPrefix(t *testing.T) {
	got := intersectPrefix([]keyRange{{"\x00", "\x00"}}, "/app/")
	want := []keyRange{{"/app/", "/app0"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
	if got := intersectPrefix([]keyRange{{"a", "b"}}, "z"); len(got) != 0 {
		t.Fatalf("unexpected unauthorized range: %#v", got)
	}
}

package handlers

import (
	"context"
	"reflect"
	"testing"

	"go.etcd.io/etcd/api/v3/authpb"
	clientv3 "go.etcd.io/etcd/client/v3"
)

type fakeAuth struct {
	clientv3.Auth
	roles       []string
	permissions map[string][]*authpb.Permission
}

func (f fakeAuth) UserGet(context.Context, string) (*clientv3.AuthUserGetResponse, error) {
	return &clientv3.AuthUserGetResponse{Roles: f.roles}, nil
}
func (f fakeAuth) RoleGet(_ context.Context, role string) (*clientv3.AuthRoleGetResponse, error) {
	return &clientv3.AuthRoleGetResponse{Perm: f.permissions[role]}, nil
}

func TestReadableRanges(t *testing.T) {
	for _, tc := range []struct {
		name string
		auth fakeAuth
		want []keyRange
	}{
		{"root role on arbitrary username", fakeAuth{roles: []string{"root"}}, []keyRange{{"\x00", "\x00"}}},
		{"no roles", fakeAuth{}, []keyRange{}},
		{"permission types and exact keys", fakeAuth{roles: []string{"custom"}, permissions: map[string][]*authpb.Permission{"custom": {
			{Key: []byte("exact"), PermType: authpb.READ},
			{Key: []byte("secret"), RangeEnd: []byte("z"), PermType: authpb.WRITE},
			{Key: []byte("/prefix/"), RangeEnd: []byte("/prefix0"), PermType: authpb.READWRITE},
		}}}, []keyRange{{"/prefix/", "/prefix0"}, {"exact", "exact\x00"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := readableRanges(context.Background(), tc.auth, "alice")
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("ranges = %#v, want %#v", got, tc.want)
			}
		})
	}
}

func TestMergeRanges(t *testing.T) {
	got := mergeRanges([]keyRange{{"b", "f"}, {"a", "c"}, {"f", "g"}, {"z", "\x00"}, {"y", "zz"}})
	want := []keyRange{{"a", "g"}, {"y", "\x00"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}

func TestReadEmptyRangesDoesNotCallEtcd(t *testing.T) {
	result, err := readRanges(context.Background(), nil, nil)
	if err != nil || result == nil || result.Count != 0 {
		t.Fatalf("unexpected result: %+v, %v", result, err)
	}
}

//go:build integration

package handlers

import (
	"context"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/log"
	clientv3 "go.etcd.io/etcd/client/v3"
)

// Run only against the disposable cluster created by scripts/test-integration.sh.
func TestRBACIntegration(t *testing.T) {
	endpoint := os.Getenv("ETCD_TEST_ENDPOINT")
	if endpoint == "" {
		t.Fatal("use scripts/test-integration.sh to create an isolated cluster")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	setup, err := clientv3.New(clientv3.Config{Endpoints: []string{endpoint}, DialTimeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	defer setup.Close()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		attempt, done := context.WithTimeout(ctx, time.Second)
		_, err := setup.Status(attempt, endpoint)
		done()
		if err == nil {
			break
		}
		select {
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		case <-ticker.C:
		}
	}
	const password = "integration-only-password"
	if _, err := setup.UserAdd(ctx, "root", password); err != nil {
		t.Fatal(err)
	}
	if _, err := setup.UserGrantRole(ctx, "root", "root"); err != nil {
		t.Fatal(err)
	}
	if _, err := setup.AuthEnable(ctx); err != nil {
		t.Fatal(err)
	}
	admin, err := clientv3.New(clientv3.Config{Endpoints: []string{endpoint}, Username: "root", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	for _, key := range []string{"/a", "/a/child", "/b", "exact", "exact/child", "z"} {
		if _, err := admin.Put(ctx, key, "value"); err != nil {
			t.Fatal(err)
		}
	}
	provider := etcd.NewBackendProvider()
	defer provider.Close()
	if err := provider.RegisterBackend("test", []string{endpoint}, "root", password); err != nil {
		t.Fatal(err)
	}
	backend, err := provider.GetBackend("test")
	if err != nil {
		t.Fatal(err)
	}
	logger, err := log.NewLogger(log.ERROR)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewHTTPHandler(logger)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, start, end string
		permission       clientv3.PermissionType
		root             bool
		want             []string
	}{
		{name: "empty"},
		{name: "exact", start: "exact", permission: clientv3.PermissionType(clientv3.PermRead), want: []string{"exact"}},
		{name: "range", start: "/a", end: "/c", permission: clientv3.PermissionType(clientv3.PermRead), want: []string{"/a", "/a/child", "/b"}},
		{name: "writeonly", start: "/a", end: "/c", permission: clientv3.PermissionType(clientv3.PermWrite)},
		{name: "administrator", root: true, want: []string{"/a", "/a/child", "/b", "exact", "exact/child", "z"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := admin.UserAdd(ctx, tc.name, password); err != nil {
				t.Fatal(err)
			}
			if tc.root {
				if _, err := admin.UserGrantRole(ctx, tc.name, "root"); err != nil {
					t.Fatal(err)
				}
			} else if tc.start != "" {
				if _, err := admin.RoleAdd(ctx, tc.name); err != nil {
					t.Fatal(err)
				}
				if _, err := admin.RoleGrantPermission(ctx, tc.name, tc.start, tc.end, tc.permission); err != nil {
					t.Fatal(err)
				}
				if _, err := admin.UserGrantRole(ctx, tc.name, tc.name); err != nil {
					t.Fatal(err)
				}
			}
			result, err := handler.getKeys(ctx, backend, tc.name, password)
			if err != nil {
				t.Fatal(err)
			}
			var keys []string
			for _, kv := range result.Kvs {
				keys = append(keys, string(kv.Key))
			}
			if !reflect.DeepEqual(keys, tc.want) {
				t.Fatalf("keys = %q, want %q", keys, tc.want)
			}
			if _, err := handler.getKeys(ctx, backend, tc.name, "wrong"); err == nil {
				t.Fatal("wrong password accepted")
			}
			if tc.name == "range" {
				if _, err := admin.RoleAdd(ctx, "overlap"); err != nil {
					t.Fatal(err)
				}
				if _, err := admin.RoleGrantPermission(ctx, "overlap", "/a", "/b", clientv3.PermissionType(clientv3.PermRead)); err != nil {
					t.Fatal(err)
				}
				if _, err := admin.UserGrantRole(ctx, tc.name, "overlap"); err != nil {
					t.Fatal(err)
				}
				result, err := handler.getKeys(ctx, backend, tc.name, password)
				if err != nil || len(result.Kvs) != 3 {
					t.Fatalf("overlap result: %+v, %v", result, err)
				}
				if _, err := admin.UserRevokeRole(ctx, tc.name, tc.name); err != nil {
					t.Fatal(err)
				}
				result, err = handler.getKeys(ctx, backend, tc.name, password)
				if err != nil || len(result.Kvs) != 2 {
					t.Fatalf("revoked range still accessible: %+v, %v", result, err)
				}
				if _, err := admin.UserRevokeRole(ctx, tc.name, "overlap"); err != nil {
					t.Fatal(err)
				}
				result, err = handler.getKeys(ctx, backend, tc.name, password)
				if err != nil || len(result.Kvs) != 0 {
					t.Fatalf("revoked roles still accessible: %+v, %v", result, err)
				}
			}
		})
	}
}

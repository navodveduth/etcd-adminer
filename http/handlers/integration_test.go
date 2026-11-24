//go:build integration

package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"sort"
	"strconv"
	"testing"
	"time"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/log"
	clientv3 "go.etcd.io/etcd/client/v3"
)

// Run only against the disposable cluster created by scripts/test-integration.sh.
func TestRBACIntegration(t *testing.T) {
	endpoint := os.Getenv("ETCD_TEST_ENDPOINT")
	if endpoint == "" {
		t.Fatal("use scripts/test-integration.sh to create an isolated cluster")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
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
	t.Run("conditional writes preserve leases and reject conflicts", func(t *testing.T) {
		lease, err := admin.Grant(ctx, 120)
		if err != nil {
			t.Fatal(err)
		}
		written, err := admin.Put(ctx, "/leased", "before", clientv3.WithLease(lease.ID))
		if err != nil {
			t.Fatal(err)
		}
		write := func(key, value, revision string) *httptest.ResponseRecorder {
			body, err := json.Marshal(request.CreateKeyRequest{Key: key, Value: value, ExpectedRevision: revision})
			if err != nil {
				t.Fatal(err)
			}
			r := httptest.NewRequest("PUT", "/api/keys", bytes.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			r = r.WithContext(context.WithValue(ctx, META_KEY, request.RequestMeta{Backend: backend, User: "root", Pass: password}))
			w := httptest.NewRecorder()
			handler.UpdateKey(w, r)
			return w
		}
		revision := strconv.FormatInt(written.Header.Revision, 10)
		if w := write("/leased", "after", revision); w.Code != 200 {
			t.Fatalf("save: %d %s", w.Code, w.Body.String())
		}
		if w := write("/leased", "stale", revision); w.Code != 409 {
			t.Fatalf("stale save: %d %s", w.Code, w.Body.String())
		}
		value, err := admin.Get(ctx, "/leased")
		if err != nil {
			t.Fatal(err)
		}
		if value.Kvs[0].Lease != int64(lease.ID) || string(value.Kvs[0].Value) != "after" {
			t.Fatal("lease or value changed unexpectedly")
		}
		if w := write("/new", "first", "0"); w.Code != 200 {
			t.Fatalf("create: %d %s", w.Code, w.Body.String())
		}
		if w := write("/new", "overwrite", "0"); w.Code != 409 {
			t.Fatalf("duplicate create: %d %s", w.Code, w.Body.String())
		}
		if w := write("/new", "unsafe", ""); w.Code != 400 {
			t.Fatalf("missing revision: %d", w.Code)
		}
	})
	t.Run("bounded pages retain their snapshot and reject altered cursors", func(t *testing.T) {
		list := func(prefix, cursor string) *httptest.ResponseRecorder {
			query := url.Values{"prefix": {prefix}, "limit": {"1"}}
			if cursor != "" {
				query.Set("cursor", cursor)
			}
			r := httptest.NewRequest("GET", "/api/v1/keys?"+query.Encode(), nil)
			r = r.WithContext(context.WithValue(ctx, META_KEY, request.RequestMeta{Backend: backend, User: "root", Pass: password}))
			w := httptest.NewRecorder()
			handler.ListKeys(w, r)
			return w
		}
		firstResponse := list("/a", "")
		if firstResponse.Code != 200 {
			t.Fatalf("first page: %d %s", firstResponse.Code, firstResponse.Body.String())
		}
		var first keyPage
		if err := json.Unmarshal(firstResponse.Body.Bytes(), &first); err != nil {
			t.Fatal(err)
		}
		if len(first.Items) != 1 || first.Items[0].Key != "/a" || !first.HasMore {
			t.Fatalf("unexpected first page: %+v", first)
		}
		if _, err := admin.Put(ctx, "/a/new", "must not appear in old snapshot"); err != nil {
			t.Fatal(err)
		}
		secondResponse := list("/a", first.NextCursor)
		if secondResponse.Code != 200 {
			t.Fatalf("second page: %d %s", secondResponse.Code, secondResponse.Body.String())
		}
		var second keyPage
		if err := json.Unmarshal(secondResponse.Body.Bytes(), &second); err != nil {
			t.Fatal(err)
		}
		if len(second.Items) != 1 || second.Items[0].Key != "/a/child" || second.HasMore || second.Revision != first.Revision {
			t.Fatalf("inconsistent snapshot: %+v", second)
		}
		if w := list("/b", first.NextCursor); w.Code != 400 {
			t.Fatalf("changed query accepted: %d", w.Code)
		}
		if w := list("/a", first.NextCursor+"tamper"); w.Code != 400 {
			t.Fatalf("tampered cursor accepted: %d", w.Code)
		}
		revision, err := strconv.ParseInt(first.Revision, 10, 64)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := admin.Compact(ctx, revision+1); err != nil {
			t.Fatal(err)
		}
		if w := list("/a", first.NextCursor); w.Code != 409 {
			t.Fatalf("compacted cursor: %d %s", w.Code, w.Body.String())
		}
	})
	t.Run("100k key first page benchmark", func(t *testing.T) {
		if os.Getenv("ETCD_TEST_LARGE") != "1" {
			t.Skip("set ETCD_TEST_LARGE=1 to seed 100k keys in the disposable cluster")
		}
		for start := 0; start < 100000; start += 100 {
			operations := make([]clientv3.Op, 0, 100)
			for index := start; index < start+100; index++ {
				operations = append(operations, clientv3.OpPut(fmt.Sprintf("/benchmark/%06d", index), "representative value"))
			}
			if _, err := admin.Txn(ctx).Then(operations...).Commit(); err != nil {
				t.Fatal(err)
			}
		}
		latencies := make([]time.Duration, 0, 20)
		for sample := 0; sample < 20; sample++ {
			r := httptest.NewRequest("GET", "/api/v1/keys?prefix=%2Fbenchmark%2F&limit=100", nil)
			r = r.WithContext(context.WithValue(ctx, META_KEY, request.RequestMeta{Backend: backend, User: "root", Pass: password}))
			w := httptest.NewRecorder()
			start := time.Now()
			handler.ListKeys(w, r)
			latencies = append(latencies, time.Since(start))
			if w.Code != 200 {
				t.Fatalf("benchmark request: %d %s", w.Code, w.Body.String())
			}
			var page keyPage
			if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
				t.Fatal(err)
			}
			if len(page.Items) != 100 || !page.HasMore || w.Body.Len() > 64*1024 {
				t.Fatal("first-page work was not bounded")
			}
		}
		sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
		t.Logf("100k-key authenticated first page, 20 samples: p50=%s p95=%s", latencies[9], latencies[18])
	})
}

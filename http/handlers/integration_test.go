//go:build integration

package handlers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/log"
	"go.etcd.io/etcd/api/v3/v3rpc/rpctypes"
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
	tlsOptions := etcd.TLSOptions{}
	if directory := os.Getenv("ETCD_TEST_CERTIFICATES"); directory != "" {
		tlsOptions = etcd.TLSOptions{Enabled: true, CAFile: filepath.Join(directory, "ca.pem"), CertFile: filepath.Join(directory, "client.pem"), KeyFile: filepath.Join(directory, "client-key.pem")}
	}
	tlsConfig, err := tlsOptions.Load()
	if err != nil {
		t.Fatal(err)
	}
	setup, err := clientv3.New(clientv3.Config{Endpoints: []string{endpoint}, DialTimeout: 5 * time.Second, TLS: tlsConfig})
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
	admin, err := clientv3.New(clientv3.Config{Endpoints: []string{endpoint}, Username: "root", Password: password, TLS: tlsConfig})
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
	if err := provider.RegisterBackend("test", []string{endpoint}, "root", password, etcd.WithTLS(tlsConfig)); err != nil {
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
	t.Run("RBAC administration and legacy protections", func(t *testing.T) {
		invoke := func(method, path, user, pass, body string, action http.HandlerFunc, vars map[string]string) *httptest.ResponseRecorder {
			r := httptest.NewRequest(method, path, strings.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			r = r.WithContext(context.WithValue(ctx, META_KEY, request.RequestMeta{Backend: backend, User: user, Pass: pass}))
			if vars != nil {
				r = mux.SetURLVars(r, vars)
			}
			w := httptest.NewRecorder()
			action(w, r)
			return w
		}
		check := func(w *httptest.ResponseRecorder, status int) {
			t.Helper()
			if w.Code != status {
				t.Fatalf("wanted %d, got %d: %s", status, w.Code, w.Body.String())
			}
		}
		call := func(method, path, body string, action http.HandlerFunc, status int) *httptest.ResponseRecorder {
			t.Helper()
			w := invoke(method, path, "root", password, body, action, nil)
			check(w, status)
			return w
		}
		call("POST", "/", `{"name":"team/reader"}`, handler.Roles, 201)
		call("POST", "/", `{"name":"team/reader"}`, handler.Roles, 409)
		call("POST", "/", `{"userName":"person/one","password":"initial-password","roles":[]}`, handler.CreateUser, 201)
		check(invoke("GET", "/", "person/one", "initial-password", "", handler.Roles, nil), 403)
		for _, rule := range []string{
			`{"name":"team/reader","access":"read","scope":"exact","key":"/rbac/exact"}`,
			`{"name":"team/reader","access":"read","scope":"prefix","key":"/rbac/prefix/"}`,
			`{"name":"team/reader","access":"read","scope":"range","key":"/rbac/range/a","rangeEnd":"/rbac/range/c"}`,
		} {
			call("POST", "/", rule, handler.RolePermissions, 204)
		}
		call("POST", "/", `{"userName":"person/one","role":"team/reader","operation":"grant"}`, handler.UserRoles, 204)
		reader, err := backend.NewClient("person/one", "initial-password")
		if err != nil {
			t.Fatal(err)
		}
		defer reader.Close()
		for _, key := range []string{"/rbac/exact", "/rbac/prefix/a", "/rbac/range/b"} {
			if _, err := reader.Get(ctx, key); err != nil {
				t.Fatalf("granted read %q failed: %v", key, err)
			}
		}
		for _, key := range []string{"/rbac/exact/child", "/rbac/prefix-other", "/rbac/range/c"} {
			if _, err := reader.Get(ctx, key); err == nil {
				t.Fatalf("scope leaked read to %q", key)
			}
		}
		detail := call("GET", "/?name=team%2Freader", "", handler.RoleDetail, 200)
		var role struct {
			Permissions []permissionInput `json:"permissions"`
		}
		if err := json.Unmarshal(detail.Body.Bytes(), &role); err != nil {
			t.Fatal(err)
		}
		if len(role.Permissions) != 3 {
			t.Fatalf("wrong permissions: %s", detail.Body.String())
		}
		for _, permission := range role.Permissions {
			permission.Name = "team/reader"
			body, _ := json.Marshal(permission)
			call("DELETE", "/", string(body), handler.RolePermissions, 204)
		}
		if _, err := reader.Get(ctx, "/rbac/exact"); err == nil {
			t.Fatal("revoked permission still readable")
		}
		call("GET", "/?name=person%2Fone", "", handler.UserDetail, 200)
		call("POST", "/", `{"userName":"person/one","role":"root","operation":"grant"}`, handler.UserRoles, 400)
		check(invoke("POST", "/", "root", password, "", handler.AssignRole, map[string]string{"name": "person/one", "role": "root"}), 400)
		call("POST", "/", `{"userName":"person/one","role":"root","operation":"grant","confirmation":"GRANT ROOT"}`, handler.UserRoles, 204)
		call("POST", "/", `{"userName":"person/one","role":"root","operation":"revoke"}`, handler.UserRoles, 204)
		call("POST", "/", `{"userName":"root","role":"root","operation":"revoke"}`, handler.UserRoles, 400)
		check(invoke("DELETE", "/", "root", password, "", handler.UnassignRole, map[string]string{"name": "root", "role": "root"}), 400)
		check(invoke("DELETE", "/", "root", password, "", handler.DeleteUser, map[string]string{"name": "root"}), 400)
		call("DELETE", "/?name=root", `{"confirmation":"root"}`, handler.RoleDetail, 400)
		call("DELETE", "/?name=root", `{"confirmation":"root"}`, handler.UserDetail, 400)
		call("POST", "/", `{"userName":"root","password":"changed"}`, handler.UserPassword, 400)
		if _, err := admin.UserAdd(ctx, "service-admin", password); err != nil {
			t.Fatal(err)
		}
		if _, err := admin.UserGrantRole(ctx, "service-admin", "root"); err != nil {
			t.Fatal(err)
		}
		if err := provider.RegisterBackend("service-protection", []string{endpoint}, "service-admin", password, etcd.WithTLS(tlsConfig)); err != nil {
			t.Fatal(err)
		}
		serviceBackend, err := provider.GetBackend("service-protection")
		if err != nil {
			t.Fatal(err)
		}
		for _, tc := range []struct {
			action             http.HandlerFunc
			method, path, body string
			vars               map[string]string
		}{
			{handler.UserPassword, "POST", "/", `{"userName":"service-admin","password":"changed"}`, nil},
			{handler.UserRoles, "POST", "/", `{"userName":"service-admin","role":"root","operation":"revoke"}`, nil},
			{handler.UserDetail, "DELETE", "/?name=service-admin", `{"confirmation":"service-admin"}`, nil},
			{handler.UnassignRole, "DELETE", "/", "", map[string]string{"name": "service-admin", "role": "root"}},
			{handler.DeleteUser, "DELETE", "/", "", map[string]string{"name": "service-admin"}},
		} {
			r := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			r.Header.Set("Content-Type", "application/json")
			r = r.WithContext(context.WithValue(ctx, META_KEY, request.RequestMeta{Backend: serviceBackend, User: "root", Pass: password}))
			if tc.vars != nil {
				r = mux.SetURLVars(r, tc.vars)
			}
			w := httptest.NewRecorder()
			tc.action(w, r)
			check(w, 400)
		}
		check(invoke("POST", "/", "person/one", "initial-password", `{"userName":"person/one","password":"changed-password"}`, handler.UserPassword, nil), 403)
		call("POST", "/", `{"userName":"person/one","password":"changed-password"}`, handler.UserPassword, 204)
		changed, err := backend.NewClient("person/one", "changed-password")
		if err != nil {
			t.Fatal(err)
		}
		defer changed.Close()
		if _, err := changed.Authenticate(ctx, "person/one", "changed-password"); err != nil {
			t.Fatal(err)
		}
		if _, err := changed.Authenticate(ctx, "person/one", "initial-password"); err == nil {
			t.Fatal("old password still authenticates")
		}
		call("DELETE", "/?name=team%2Freader", `{"confirmation":"team/reader"}`, handler.RoleDetail, 204)
		call("DELETE", "/?name=person%2Fone", `{"confirmation":"person/one"}`, handler.UserDetail, 204)
		call("GET", "/?name=person%2Fone", "", handler.UserDetail, 404)
	})
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
			if !tc.root {
				caller, err := backend.NewClient(tc.name, password)
				if err != nil {
					t.Fatal(err)
				}
				defer caller.Close()
				if _, err := caller.Get(ctx, "/forbidden"); !errors.Is(err, rpctypes.ErrPermissionDenied) {
					t.Fatalf("transport overrode caller permissions: %v", err)
				}
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
		write := func(key, value, revision string, leases ...string) *httptest.ResponseRecorder {
			payload := request.CreateKeyRequest{Key: key, Value: value, ExpectedRevision: revision}
			if len(leases) > 0 {
				payload.Lease = &leases[0]
			}
			body, err := json.Marshal(payload)
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
		if w := write("/leased", "permanent", strconv.FormatInt(value.Kvs[0].ModRevision, 10), "0"); w.Code != 200 {
			t.Fatalf("detach: %d %s", w.Code, w.Body.String())
		}
		if _, err := admin.Revoke(ctx, lease.ID); err != nil {
			t.Fatal(err)
		}
		value, err = admin.Get(ctx, "/leased")
		if err != nil || value.Count != 1 || value.Kvs[0].Lease != 0 {
			t.Fatal("detached key did not survive lease revocation")
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
	t.Run("lease expiration deletes attached keys", func(t *testing.T) {
		lease, err := admin.Grant(ctx, 1)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := admin.Put(ctx, "/lease-expiry", "temporary", clientv3.WithLease(lease.ID)); err != nil {
			t.Fatal(err)
		}
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		deadline := time.NewTimer(10 * time.Second)
		defer deadline.Stop()
		for {
			select {
			case <-ticker.C:
				value, err := admin.Get(ctx, "/lease-expiry")
				if err != nil {
					t.Fatal(err)
				}
				if value.Count == 0 {
					return
				}
			case <-deadline.C:
				t.Fatal("expired lease did not delete its attached key")
			}
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
	t.Run("lease lifecycle authorization attachment and revocation", func(t *testing.T) {
		invoke := func(method, id, user, body string, action func(http.ResponseWriter, *http.Request)) *httptest.ResponseRecorder {
			r := httptest.NewRequest(method, "/api/v1/leases", strings.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			r = r.WithContext(context.WithValue(ctx, META_KEY, request.RequestMeta{Backend: backend, User: user, Pass: password}))
			r = mux.SetURLVars(r, map[string]string{"id": id})
			w := httptest.NewRecorder()
			action(w, r)
			return w
		}
		if w := invoke("GET", "", "empty", "", handler.Leases); w.Code != 403 {
			t.Fatalf("non-admin listed leases: %d %s", w.Code, w.Body.String())
		}
		granted := invoke("POST", "", "root", `{"ttl":60}`, handler.Leases)
		if granted.Code != 200 {
			t.Fatalf("grant: %d %s", granted.Code, granted.Body.String())
		}
		var lease struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(granted.Body.Bytes(), &lease); err != nil {
			t.Fatal(err)
		}
		id, err := leaseID(lease.ID)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := admin.Put(ctx, "/lease-lifecycle", "temporary", clientv3.WithLease(id)); err != nil {
			t.Fatal(err)
		}
		detail := invoke("GET", lease.ID, "root", "", handler.Lease)
		if detail.Code != 200 || !strings.Contains(detail.Body.String(), `"keyCount":1`) {
			t.Fatalf("detail: %d %s", detail.Code, detail.Body.String())
		}
		if w := invoke("POST", lease.ID, "root", "", handler.Lease); w.Code != 200 {
			t.Fatalf("renew: %d %s", w.Code, w.Body.String())
		}
		if w := invoke("DELETE", lease.ID, "root", `{"confirmation":"wrong"}`, handler.Lease); w.Code != 400 {
			t.Fatal("revoke accepted wrong confirmation")
		}
		if w := invoke("DELETE", lease.ID, "root", `{"confirmation":"`+lease.ID+`"}`, handler.Lease); w.Code != 204 {
			t.Fatalf("revoke: %d %s", w.Code, w.Body.String())
		}
		value, err := admin.Get(ctx, "/lease-lifecycle")
		if err != nil || value.Count != 0 {
			t.Fatalf("attached key survived revocation: %+v %v", value, err)
		}
		if w := invoke("GET", lease.ID, "root", "", handler.Lease); w.Code != 404 {
			t.Fatalf("expired lease: %d %s", w.Code, w.Body.String())
		}
	})
	t.Run("watch frames resume transactions without leaking values or permissions", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := r.Header.Get("X-Test-User")
			if user == "" {
				user = "root"
			}
			r = r.WithContext(context.WithValue(r.Context(), META_KEY, request.RequestMeta{Backend: backend, User: user, Pass: password}))
			handler.Watch(w, r)
		}))
		defer server.Close()
		client := &http.Client{Timeout: 10 * time.Second}
		open := func(after string) (*http.Response, *bufio.Reader) {
			query := url.Values{"key": {"/watch-test/"}, "mode": {"prefix"}, "afterRevision": {after}}
			response, err := client.Get(server.URL + "?" + query.Encode())
			if err != nil {
				t.Fatal(err)
			}
			if response.StatusCode != 200 {
				response.Body.Close()
				t.Fatalf("watch status: %d", response.StatusCode)
			}
			return response, bufio.NewReader(response.Body)
		}
		read := func(reader *bufio.Reader) (string, map[string]json.RawMessage) {
			kind, data := "", ""
			for {
				line, err := reader.ReadString('\n')
				if err != nil {
					t.Fatal(err)
				}
				if strings.HasPrefix(line, "event:") {
					kind = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
				}
				if strings.HasPrefix(line, "data:") {
					data = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
				}
				if line == "\n" {
					break
				}
			}
			var frame map[string]json.RawMessage
			if err := json.Unmarshal([]byte(data), &frame); err != nil {
				t.Fatal(err)
			}
			if strings.Contains(data, "secret-value") {
				t.Fatal("watch leaked a value without explicit opt-in")
			}
			return kind, frame
		}
		first, reader := open("0")
		defer first.Body.Close()
		if kind, _ := read(reader); kind != "ready" {
			t.Fatal("watch did not establish a baseline revision")
		}
		if _, err := admin.Txn(ctx).Then(clientv3.OpPut("/watch-test/a", "secret-value"), clientv3.OpPut("/watch-test/b", "secret-value")).Commit(); err != nil {
			t.Fatal(err)
		}
		kind, frame := read(reader)
		var events []changeEvent
		if err := json.Unmarshal(frame["events"], &events); err != nil {
			t.Fatal(err)
		}
		if kind != "changes" || len(events) != 2 || events[0].Revision != events[1].Revision {
			t.Fatalf("transaction split: %s %+v", kind, events)
		}
		var revision string
		if err := json.Unmarshal(frame["revision"], &revision); err != nil {
			t.Fatal(err)
		}
		_ = first.Body.Close()
		if _, err := admin.Put(ctx, "/watch-test/c", "secret-value"); err != nil {
			t.Fatal(err)
		}
		second, reader := open(revision)
		defer second.Body.Close()
		if kind, _ := read(reader); kind != "ready" {
			t.Fatal("resume missing ready frame")
		}
		kind, frame = read(reader)
		if err := json.Unmarshal(frame["events"], &events); err != nil {
			t.Fatal(err)
		}
		if kind != "changes" || len(events) != 1 || events[0].Key != "/watch-test/c" {
			t.Fatalf("resume skipped or repeated changes: %+v", events)
		}
		if _, err := admin.Delete(ctx, "/watch-test/c"); err != nil {
			t.Fatal(err)
		}
		kind, frame = read(reader)
		if err := json.Unmarshal(frame["events"], &events); err != nil {
			t.Fatal(err)
		}
		if kind != "changes" || len(events) != 1 || events[0].Type != "DELETE" {
			t.Fatalf("missing delete event: %+v", events)
		}
		_ = second.Body.Close()
		request, err := http.NewRequest("GET", server.URL+"?key=exact&mode=prefix", nil)
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("X-Test-User", "exact")
		denied, err := client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		_ = denied.Body.Close()
		if denied.StatusCode != 403 {
			t.Fatalf("unauthorized watch started: %d", denied.StatusCode)
		}
		ticker := time.NewTicker(10 * time.Millisecond)
		defer ticker.Stop()
		deadline := time.NewTimer(2 * time.Second)
		defer deadline.Stop()
		for {
			handler.watchMu.Lock()
			active := handler.watchCount
			handler.watchMu.Unlock()
			if active == 0 {
				break
			}
			select {
			case <-ticker.C:
			case <-deadline.C:
				t.Fatal("stopped watches retained resources")
			}
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

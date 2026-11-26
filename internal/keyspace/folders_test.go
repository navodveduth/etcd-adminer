package keyspace

import (
	"context"
	"fmt"
	"reflect"
	"sort"
	"testing"
)

func TestFolderSkipsThousandsOfDescendants(t *testing.T) {
	kv := &pageKV{}
	for i := 0; i < 6194; i++ {
		kv.keys = append(kv.keys, fmt.Sprintf("/system/driver-services/project-%02d/key-%04d", i/100, i))
	}
	root, err := ReadFolder(context.Background(), kv, []Range{{"\x00", "\x00"}}, "", "", 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(root.Items, []FolderEntry{{"/system", true}}) || root.More {
		t.Fatalf("root: %+v", root)
	}
	if len(kv.calls) > 2 {
		t.Fatalf("scanned descendants: %d requests", len(kv.calls))
	}
	kv.calls = nil
	projects, err := ReadFolder(context.Background(), kv, IntersectPrefix([]Range{{"\x00", "\x00"}}, "/system/driver-services/"), "/system/driver-services/", "", 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(projects.Items) != 62 || projects.More {
		t.Fatalf("projects: %+v", projects)
	}
	if len(kv.calls) > 63 {
		t.Fatalf("scanned project keys: %d requests", len(kv.calls))
	}
	for i, call := range kv.calls {
		if call.Limit() != 1 || !call.IsKeysOnly() {
			t.Fatal("unbounded read or value fetch")
		}
		if i > 0 && call.Rev() != 7 {
			t.Fatal("snapshot not pinned")
		}
	}
}

func TestFolderContinuationPreservesRawPaths(t *testing.T) {
	kv := &pageKV{keys: []string{"/a", "/a/child", "/a/nested/key", "/b", "/b//key", "/b/child", "relative"}}
	ranges := []Range{{"\x00", "\x00"}}
	var all []FolderEntry
	after := ""
	for {
		page, err := ReadFolder(context.Background(), kv, ranges, "", after, 7, 2)
		if err != nil {
			t.Fatal(err)
		}
		all = append(all, page.Items...)
		if !page.More {
			break
		}
		if page.Next <= after {
			t.Fatal("cursor did not advance")
		}
		after = page.Next
	}
	want := []FolderEntry{{"/a", false}, {"/a", true}, {"/b", false}, {"/b", true}, {"relative", false}}
	if !reflect.DeepEqual(all, want) {
		t.Fatalf("got %#v", all)
	}
	child, err := ReadFolder(context.Background(), kv, IntersectPrefix(ranges, "/b/"), "/b/", "", 7, 100)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(child.Items, []FolderEntry{{"/b/", true}, {"/b/child", false}}) {
		t.Fatalf("lost empty path segment: %#v", child.Items)
	}
}

func TestFolderSeeksStayWithinReadableRanges(t *testing.T) {
	kv := &pageKV{keys: []string{"/private/hidden", "/system/allowed/a", "/system/allowed/z", "/system/denied/secret", "/system/other/key"}}
	ranges := []Range{{"/system/allowed/a", "/system/allowed/a\x00"}, {"/system/allowed/z", "/system/allowed/z\x00"}, {"/system/other/", "/system/other0"}}
	page, err := ReadFolder(context.Background(), kv, ranges, "", "", 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(page.Items, []FolderEntry{{"/system", true}}) {
		t.Fatalf("got %#v", page.Items)
	}
	for _, call := range kv.calls {
		allowed := false
		for _, r := range ranges {
			if string(call.KeyBytes()) >= r.Start && string(call.RangeBytes()) <= r.End {
				allowed = true
			}
		}
		if !allowed {
			t.Fatal("seek outside readable range")
		}
	}
	page, err = ReadFolder(context.Background(), kv, IntersectPrefix(ranges, "/system/"), "/system/", "", 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(page.Items, []FolderEntry{{"/system/allowed", true}, {"/system/other", true}}) {
		t.Fatalf("leaked or duplicated a folder: %#v", page.Items)
	}
}

func TestFolderBinaryAndUnusualKeys(t *testing.T) {
	keys := []string{"/", "//child", "/a//b/", "a", "a/child", "\xff/child", "日本語/key"}
	sort.Strings(keys)
	kv := &pageKV{keys: keys}
	page, err := ReadFolder(context.Background(), kv, []Range{{"\x00", "\x00"}}, "", "", 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	want := []FolderEntry{{"/", false}, {"/", true}, {"/a", true}, {"a", false}, {"a", true}, {"日本語", true}, {"\xff", true}}
	if !reflect.DeepEqual(page.Items, want) {
		t.Fatalf("got %#v", page.Items)
	}
}

func TestFolderCancellationAndEmptyPermissions(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	kv := &pageKV{}
	if _, err := ReadFolder(ctx, kv, []Range{{"\x00", "\x00"}}, "", "", 0, 100); err != context.Canceled {
		t.Fatalf("got %v", err)
	}
	if len(kv.calls) != 0 {
		t.Fatal("read after cancellation")
	}
	page, err := ReadFolder(context.Background(), kv, nil, "", "", 0, 100)
	if err != nil || len(page.Items) != 0 || len(kv.calls) != 0 {
		t.Fatal("read with no permissions")
	}
}

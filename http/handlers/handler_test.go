package handlers

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestCompositionSharesSignerAndStartsWithoutActiveWatches(t *testing.T) {
	handler, err := NewHTTPHandler(nil)
	if err != nil {
		t.Fatal(err)
	}
	if handler.Keys.Signer == nil || handler.Keys.Signer != handler.Transfer.Signer {
		t.Fatal("key listing and export must share the instance signer")
	}
	if handler.Watch.Active() != 0 {
		t.Fatal("new instance has active watches")
	}
	if handler.Access.Clients != handler.Keys.Clients {
		t.Fatal("features must use the shared client policy")
	}
}

func TestFeaturesDoNotImportSiblingHandlers(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	const prefix = "github.com/srimaln91/etcd-adminer/http/handlers"
	for _, entry := range entries {
		if !entry.IsDir() || entry.Name() == "integration" {
			continue
		}
		files, err := filepath.Glob(filepath.Join(entry.Name(), "*.go"))
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range files {
			if strings.HasSuffix(path, "_test.go") {
				continue
			}
			file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
			if err != nil {
				t.Fatal(err)
			}
			for _, dependency := range file.Imports {
				name, err := strconv.Unquote(dependency.Path.Value)
				if err != nil {
					t.Fatal(err)
				}
				if name == prefix || strings.HasPrefix(name, prefix+"/") && name != prefix+"/handlerkit" {
					t.Errorf("%s imports another handler package %s; extract reusable logic to internal/ instead", path, name)
				}
			}
		}
	}
}

package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/srimaln91/etcd-adminer/internal/testcerts"
)

func main() {
	directory := flag.String("dir", "", "existing private directory for disposable test certificates")
	flag.Parse()
	if *directory == "" {
		fmt.Fprintln(os.Stderr, "-dir is required")
		os.Exit(1)
	}
	if _, err := testcerts.Generate(*directory, ""); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

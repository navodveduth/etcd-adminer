package main

import (
	"fmt"
	"github.com/srimaln91/etcd-adminer/bootstrap"
	buildMeta "github.com/srimaln91/go-make"
	"os"
)

func main() {

	// Print binary details and terminate the program when --version flag provided.
	buildMeta.CheckVersion()

	if err := bootstrap.Init(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

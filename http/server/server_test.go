package server

import (
	"context"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/srimaln91/etcd-adminer/log"
)

func TestStartAndShutdown(t *testing.T) {
	logger, err := log.NewLogger(log.ERROR)
	if err != nil {
		t.Fatal(err)
	}
	srv, err := Start("127.0.0.1:0", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }), logger)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	t.Cleanup(func() { _ = srv.ShutDown(ctx) })
	client := &http.Client{Timeout: time.Second}
	resp, err := client.Get("http://" + srv.httpServer.Addr)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != 204 {
		t.Fatalf("status: %d", resp.StatusCode)
	}
	if err := srv.ShutDown(ctx); err != nil {
		t.Fatal(err)
	}
	if conn, err := net.DialTimeout("tcp", srv.httpServer.Addr, time.Second); err == nil {
		_ = conn.Close()
		t.Fatal("listener still accepts connections after shutdown")
	}
}

func TestStartReturnsBindError(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	if _, err := Start(listener.Addr().String(), http.NotFoundHandler(), nil); err == nil {
		t.Fatal("expected bind error")
	}
}

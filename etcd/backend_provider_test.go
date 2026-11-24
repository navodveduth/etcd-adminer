package etcd

import (
	"net"
	"testing"
	"time"
)

func TestBackendRegistrationDoesNotConnectOrAuthenticate(t *testing.T) {
	listener, err := net.ListenTCP("tcp", &net.TCPAddr{IP: net.ParseIP("127.0.0.1")})
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	provider := NewBackendProvider()
	if err := provider.RegisterBackend("offline", []string{"http://" + listener.Addr().String()}, WithProtectedUsers("managed-account")); err != nil {
		t.Fatal(err)
	}
	backend, err := provider.GetBackend("offline")
	if err != nil {
		t.Fatal(err)
	}
	if !backend.IsProtectedUser("managed-account") || backend.IsProtectedUser("other") {
		t.Fatal("incorrect account policy")
	}
	if err := listener.SetDeadline(time.Now().Add(100 * time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	connection, err := listener.Accept()
	if err == nil {
		connection.Close()
		t.Fatal("backend registration contacted etcd")
	}
	if network, ok := err.(net.Error); !ok || !network.Timeout() {
		t.Fatalf("unexpected listener result: %v", err)
	}
	if err := provider.RegisterBackend("offline", backend.Endpoints()); err == nil {
		t.Fatal("duplicate backend accepted")
	}
	if err := provider.RegisterBackend("bad-transport", []string{"file:///invalid"}); err == nil {
		t.Fatal("invalid endpoint accepted")
	}
	if err := provider.RegisterBackend("credentials", backend.Endpoints(), WithAuth("root", "unused")); err == nil {
		t.Fatal("startup credentials accepted")
	}
}

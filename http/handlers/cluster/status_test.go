package cluster

import (
	"context"
	"errors"
	"sync"
	"testing"

	"go.etcd.io/etcd/api/v3/etcdserverpb"
	clientv3 "go.etcd.io/etcd/client/v3"
)

type fakeStatus struct {
	mu     sync.Mutex
	called []string
}

func (f *fakeStatus) Status(_ context.Context, endpoint string) (*clientv3.StatusResponse, error) {
	f.mu.Lock()
	f.called = append(f.called, endpoint)
	f.mu.Unlock()
	if endpoint != "client-ok" {
		return nil, errors.New("unreachable endpoint")
	}
	return &clientv3.StatusResponse{Leader: 1, DbSize: 128, DbSizeInUse: 64, Version: "3.7.4"}, nil
}

func TestClusterStatusUsesClientURLsAndPreservesPartialResults(t *testing.T) {
	client := &fakeStatus{}
	nodes := collectMemberStatus(context.Background(), client, []*etcdserverpb.Member{
		{ID: 1, PeerURLs: []string{"peer-must-not-be-used"}, ClientURLs: []string{"client-down", "client-ok"}},
		{ID: 2, PeerURLs: []string{"peer-must-not-be-used"}},
		{ID: 3, ClientURLs: []string{"client-down"}},
	})
	if len(nodes) != 3 || !nodes[0].Available || nodes[0].LeaderStatus != "leader" || *nodes[0].DBSIze != 128 {
		t.Fatalf("healthy node missing: %+v", nodes)
	}
	for _, node := range nodes[1:] {
		if node.Available || node.Error == "" || node.DBSIze != nil || node.LeaderStatus != "unknown" {
			t.Fatalf("misleading failed status: %+v", node)
		}
	}
	for _, endpoint := range client.called {
		if endpoint == "peer-must-not-be-used" {
			t.Fatal("used a peer endpoint for client status")
		}
	}
}

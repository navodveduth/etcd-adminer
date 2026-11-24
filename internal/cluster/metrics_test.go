package cluster

import (
	"context"
	"errors"
	"testing"

	"go.etcd.io/etcd/api/v3/etcdserverpb"
	clientv3 "go.etcd.io/etcd/client/v3"
)

type fakeClient struct{}

func (fakeClient) Status(_ context.Context, endpoint string) (*clientv3.StatusResponse, error) {
	if endpoint == "offline" {
		return nil, errors.New("secret remote diagnostic")
	}
	return &clientv3.StatusResponse{Header: &etcdserverpb.ResponseHeader{MemberId: 9007199254740993}, DbSize: 1024, DbSizeInUse: 512, DbSizeQuota: 4096, RaftIndex: 100, RaftAppliedIndex: 98, Leader: 9007199254740993, RaftTerm: 4}, nil
}
func (fakeClient) AlarmList(context.Context) (*clientv3.AlarmResponse, error) {
	return nil, errors.New("denied")
}
func TestCollectRetainsPartialAvailabilityAndExactIDs(t *testing.T) {
	result := Collect(context.Background(), fakeClient{}, []string{"healthy", "offline"})
	if len(result.Members) != 2 || !result.Members[0].Available || result.Members[1].Available {
		t.Fatalf("wrong availability: %+v", result)
	}
	if result.Members[0].ID != "20000000000001" || result.Members[0].ApplyLag != "2" {
		t.Fatalf("lost precision or lag: %+v", result.Members[0])
	}
	if result.Members[0].Quota == nil || result.AlarmError == "" || result.SampledAt.IsZero() {
		t.Fatal("missing telemetry metadata")
	}
	if result.Members[1].Error == "secret remote diagnostic" {
		t.Fatal("raw remote error leaked")
	}
}

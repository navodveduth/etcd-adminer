package cluster

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	"go.etcd.io/etcd/api/v3/etcdserverpb"
	clientv3 "go.etcd.io/etcd/client/v3"
)

const (
	leaderStatusUnknown  = "unknown"
	leaderStatusLeader   = "leader"
	leaderStatusFollower = "follower"
)

type statusGetter interface {
	Status(context.Context, string) (*clientv3.StatusResponse, error)
}

func memberStatus(ctx context.Context, client statusGetter, member *etcdserverpb.Member) response.ClusterNode {
	node := response.ClusterNode{
		Name: member.GetName(), ID: member.GetID(), IsLearner: member.GetIsLearner(),
		PeerUrls: member.GetPeerURLs(), ClientUrls: member.GetClientURLs(), LeaderStatus: leaderStatusUnknown,
	}
	if len(node.ClientUrls) == 0 {
		node.Error = "no client URL advertised"
		return node
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	for _, endpoint := range node.ClientUrls {
		status, err := client.Status(ctx, endpoint)
		if err != nil {
			continue
		}
		node.Available = true
		node.Version = status.Version
		node.DBSIze, node.DBSizeInUse = &status.DbSize, &status.DbSizeInUse
		if status.Leader == member.GetID() {
			node.LeaderStatus = leaderStatusLeader
		} else if status.Leader != 0 {
			node.LeaderStatus = leaderStatusFollower
		}
		return node
	}
	node.Error = "client endpoints unavailable or access denied"
	return node
}

// collectMemberStatus preserves member order while bounding concurrent RPCs.
func collectMemberStatus(ctx context.Context, client statusGetter, members []*etcdserverpb.Member) []response.ClusterNode {
	nodes := make([]response.ClusterNode, len(members))
	jobs := make(chan int)
	var workers sync.WaitGroup
	for worker := 0; worker < 4 && worker < len(members); worker++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for index := range jobs {
				nodes[index] = memberStatus(ctx, client, members[index])
			}
		}()
	}
	for index := range members {
		jobs <- index
	}
	close(jobs)
	workers.Wait()
	return nodes
}

func (jh *Handler) ClusterInfo(w http.ResponseWriter, r *http.Request) {
	meta, ok := request.Meta(r.Context())
	if !ok {
		response.WriteError(w, http.StatusInternalServerError, "internal_error", "request metadata missing")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	client, err := meta.Backend.NewClient(meta.User, meta.Pass)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	defer jh.CloseEtcdClient(client)
	members, err := client.MemberList(ctx)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	result := response.ClusterInfo{
		ClusterID: members.Header.GetClusterId(), MemberID: members.Header.GetMemberId(),
		RaftTerm: members.Header.GetRaftTerm(), Revision: members.Header.GetRevision(),
		Nodes: collectMemberStatus(ctx, client, members.Members),
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(result)
}

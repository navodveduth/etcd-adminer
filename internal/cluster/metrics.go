// Package cluster collects bounded, caller-authorized maintenance telemetry.
package cluster

import (
	"context"
	"strconv"
	"sync"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
)

type Client interface {
	Status(context.Context, string) (*clientv3.StatusResponse, error)
	AlarmList(context.Context) (*clientv3.AlarmResponse, error)
}

type Member struct {
	Endpoint     string   `json:"endpoint"`
	Available    bool     `json:"available"`
	Error        string   `json:"error,omitempty"`
	ID           string   `json:"id,omitempty"`
	Leader       string   `json:"leader,omitempty"`
	Version      string   `json:"version,omitempty"`
	DBSize       int64    `json:"dbSize"`
	DBInUse      int64    `json:"dbInUse"`
	Quota        *int64   `json:"quota"`
	RaftIndex    string   `json:"raftIndex,omitempty"`
	AppliedIndex string   `json:"appliedIndex,omitempty"`
	ApplyLag     string   `json:"applyLag,omitempty"`
	Term         string   `json:"term,omitempty"`
	Errors       []string `json:"errors"`
}
type Alarm struct {
	Member string `json:"member"`
	Type   string `json:"type"`
}
type Sample struct {
	SampledAt  time.Time `json:"sampledAt"`
	Source     string    `json:"source"`
	Members    []Member  `json:"members"`
	Alarms     []Alarm   `json:"alarms"`
	AlarmError string    `json:"alarmError,omitempty"`
	Truncated  bool      `json:"truncated"`
}

// Only operator-configured endpoints are contacted, never URLs supplied by a
// browser or advertised by an untrusted remote member. No keyspace is scanned.
func Collect(ctx context.Context, client Client, endpoints []string) Sample {
	sample := Sample{Source: "etcd maintenance Status/AlarmList", Alarms: []Alarm{}, Truncated: len(endpoints) > 16}
	if len(endpoints) > 16 {
		endpoints = endpoints[:16]
	}
	sample.Members = make([]Member, len(endpoints))
	jobs := make(chan int)
	var workers sync.WaitGroup
	for worker := 0; worker < 4 && worker < len(endpoints); worker++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for i := range jobs {
				node := Member{Endpoint: endpoints[i], Errors: []string{}}
				bounded, cancel := context.WithTimeout(ctx, 2*time.Second)
				status, err := client.Status(bounded, endpoints[i])
				cancel()
				if err != nil {
					node.Error = "endpoint unavailable or access denied"
					sample.Members[i] = node
					continue
				}
				node.Available = true
				node.ID = strconv.FormatUint(status.Header.GetMemberId(), 16)
				node.Leader = strconv.FormatUint(status.Leader, 16)
				node.Version, node.DBSize, node.DBInUse = status.Version, status.DbSize, status.DbSizeInUse
				if status.DbSizeQuota > 0 {
					quota := status.DbSizeQuota
					node.Quota = &quota
				}
				node.RaftIndex, node.AppliedIndex, node.Term = strconv.FormatUint(status.RaftIndex, 10), strconv.FormatUint(status.RaftAppliedIndex, 10), strconv.FormatUint(status.RaftTerm, 10)
				if status.RaftIndex >= status.RaftAppliedIndex {
					node.ApplyLag = strconv.FormatUint(status.RaftIndex-status.RaftAppliedIndex, 10)
				}
				node.Errors = append(node.Errors, status.Errors...)
				sample.Members[i] = node
			}
		}()
	}
	for i := range endpoints {
		jobs <- i
	}
	close(jobs)
	workers.Wait()
	bounded, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	alarms, err := client.AlarmList(bounded)
	if err != nil {
		sample.AlarmError = "alarm inventory unavailable or access denied"
	} else {
		for _, alarm := range alarms.Alarms {
			sample.Alarms = append(sample.Alarms, Alarm{strconv.FormatUint(alarm.MemberID, 16), alarm.Alarm.String()})
		}
	}
	sample.SampledAt = time.Now().UTC()
	return sample
}

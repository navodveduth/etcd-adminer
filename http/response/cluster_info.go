package response

type ClusterNode struct {
	Name         string   `json:"name"`
	ID           uint64   `json:"ID,string"`
	IsLearner    bool     `json:"isLearner"`
	PeerUrls     []string `json:"peerUrls"`
	ClientUrls   []string `json:"clientUrls"`
	LeaderStatus string   `json:"isLeader"`
	DBSIze       *int64   `json:"dbSize"`
	DBSizeInUse  *int64   `json:"dbSizeInUse"`
	Available    bool     `json:"available"`
	Error        string   `json:"error,omitempty"`
	Version      string   `json:"version,omitempty"`
}

type ClusterInfo struct {
	ClusterID uint64        `json:"clusterID,string"`
	MemberID  uint64        `json:"memberID,string"`
	RaftTerm  uint64        `json:"raftTerm,string"`
	Revision  int64         `json:"revision,string"`
	Nodes     []ClusterNode `json:"nodes"`
}

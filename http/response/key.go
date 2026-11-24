package response

type Key struct {
	Key            string `json:"key"`
	Value          string `json:"value"`
	CreateRevision int64  `json:"createRevision,string"`
	ModRevision    int64  `json:"modRevision,string"`
	Version        int64  `json:"version,string"`
	Lease          int64  `json:"lease,string"`
}

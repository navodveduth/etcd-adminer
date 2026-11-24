package response

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"unicode/utf8"
)

func WriteJSON(w http.ResponseWriter, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(value)
}

func DisplayBytes(value []byte) (string, string) {
	if utf8.Valid(value) {
		return string(value), "utf8"
	}
	return base64.StdEncoding.EncodeToString(value), "base64"
}

type KeySummary struct {
	Key         string `json:"key"`
	KeyEncoding string `json:"keyEncoding"`
	ModRevision string `json:"modRevision"`
}

type KeyPage struct {
	Items      []KeySummary `json:"items"`
	NextCursor string       `json:"nextCursor,omitempty"`
	Revision   string       `json:"revision"`
	HasMore    bool         `json:"hasMore"`
}

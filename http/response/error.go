package response

import (
	"encoding/json"
	"net/http"
)

// WriteError returns a stable, non-secret-bearing API error.
func WriteError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}{code, message})
}

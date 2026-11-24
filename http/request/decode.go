package request

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

const MaxBodyBytes = 2 * 1024 * 1024

// DecodeJSON accepts exactly one JSON object and bounds memory spent decoding it.
func DecodeJSON(w http.ResponseWriter, r *http.Request, target interface{}) error {
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	// Decode through an envelope to distinguish null from an actual object.
	var raw json.RawMessage
	if err := d.Decode(&raw); err != nil {
		return err
	}
	if len(raw) == 0 || raw[0] != '{' {
		return errors.New("expected JSON object")
	}
	var extra interface{}
	if err := d.Decode(&extra); err != io.EOF {
		return errors.New("expected one JSON object")
	}
	object := json.NewDecoder(bytes.NewReader(raw))
	object.DisallowUnknownFields()
	return object.Decode(target)
}

package keyspace

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const maxCursorBytes = 64 * 1024

type Cursor struct {
	Purpose  string `json:"purpose,omitempty"`
	Backend  string `json:"backend"`
	User     string `json:"user"`
	Prefix   string `json:"prefix"`
	Limit    int    `json:"limit"`
	Last     []byte `json:"last"`
	Revision int64  `json:"revision"`
	Expires  int64  `json:"expires"`
}

type Signer struct{ secret []byte }

func NewSigner() (*Signer, error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}
	return &Signer{secret: secret}, nil
}

func (signer *Signer) signature(payload []byte, password string) []byte {
	mac := hmac.New(sha256.New, signer.secret)
	_, _ = mac.Write(payload)
	_, _ = mac.Write([]byte{0})
	_, _ = mac.Write([]byte(password))
	return mac.Sum(nil)
}

func (signer *Signer) Encode(cursor Cursor, password string) (string, error) {
	payload, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(signer.signature(payload, password))
	if len(token) > maxCursorBytes {
		return "", errors.New("key exceeds cursor size budget")
	}
	return token, nil
}

func (signer *Signer) Decode(token, password string, expected Cursor) (Cursor, error) {
	invalid := errors.New("invalid or expired cursor")
	if len(token) > maxCursorBytes {
		return Cursor{}, invalid
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return Cursor{}, invalid
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return Cursor{}, invalid
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(signature, signer.signature(payload, password)) {
		return Cursor{}, invalid
	}
	var cursor Cursor
	if err := json.Unmarshal(payload, &cursor); err != nil {
		return Cursor{}, invalid
	}
	if cursor.Purpose != expected.Purpose || cursor.Backend != expected.Backend || cursor.User != expected.User || cursor.Prefix != expected.Prefix || cursor.Limit != expected.Limit || cursor.Revision <= 0 || len(cursor.Last) == 0 || cursor.Expires <= time.Now().Unix() {
		return Cursor{}, invalid
	}
	return cursor, nil
}

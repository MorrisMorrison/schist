package crypto

import (
	"crypto/sha256"
	"fmt"
	"io"

	"golang.org/x/crypto/hkdf"
)

// DeriveKey turns a server secret (SCHIST_SECRET_KEY, or the JWT secret)
// into an AES-256 key for one purpose. HKDF-SHA256 with the purpose as info
// means each use of the same secret gets an independent key, so the key that
// protects stored tokens is never the key that signs sessions.
func DeriveKey(secret, purpose string) ([]byte, error) {
	if secret == "" {
		return nil, fmt.Errorf("a server secret is required to derive a key")
	}
	key := make([]byte, keyLength)
	if _, err := io.ReadFull(hkdf.New(sha256.New, []byte(secret), nil, []byte(purpose)), key); err != nil {
		return nil, fmt.Errorf("failed to derive key: %w", err)
	}
	return key, nil
}

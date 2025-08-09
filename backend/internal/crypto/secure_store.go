package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"

	"golang.org/x/crypto/scrypt"
)

const (
	keyLength   = 32
	nonceLength = 12
	saltLength  = 32
	scryptN     = 32768
	scryptR     = 8
	scryptP     = 1
)

type EncryptedValue struct {
	Encrypted bool   `json:"encrypted"`
	Value     string `json:"value"`
	Nonce     string `json:"nonce,omitempty"`
}

type SecureStore struct {
	masterKey []byte
	salt      []byte
	gcm       cipher.AEAD
}

func GenerateSalt() ([]byte, error) {
	salt := make([]byte, saltLength)
	_, err := rand.Read(salt)
	if err != nil {
		return nil, fmt.Errorf("failed to generate salt: %w", err)
	}
	return salt, nil
}

func NewSecureStore(password string, salt []byte) (*SecureStore, error) {
	if len(salt) != saltLength {
		return nil, fmt.Errorf("salt must be %d bytes", saltLength)
	}

	masterKey, err := scrypt.Key([]byte(password), salt, scryptN, scryptR, scryptP, keyLength)
	if err != nil {
		return nil, fmt.Errorf("failed to derive key: %w", err)
	}

	return NewSecureStoreWithKey(masterKey, salt)
}

func NewSecureStoreWithKey(masterKey []byte, salt []byte) (*SecureStore, error) {
	if len(masterKey) != keyLength {
		return nil, fmt.Errorf("master key must be %d bytes", keyLength)
	}

	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	return &SecureStore{
		masterKey: masterKey,
		salt:      salt,
		gcm:       gcm,
	}, nil
}

func (s *SecureStore) Encrypt(plaintext string) (*EncryptedValue, error) {
	if plaintext == "" {
		return &EncryptedValue{
			Encrypted: false,
			Value:     "",
		}, nil
	}

	nonce := make([]byte, s.gcm.NonceSize())
	_, err := rand.Read(nonce)
	if err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := s.gcm.Seal(nil, nonce, []byte(plaintext), nil)

	return &EncryptedValue{
		Encrypted: true,
		Value:     base64.StdEncoding.EncodeToString(ciphertext),
		Nonce:     base64.StdEncoding.EncodeToString(nonce),
	}, nil
}

func (s *SecureStore) Decrypt(encrypted *EncryptedValue) (string, error) {
	if encrypted == nil {
		return "", nil
	}

	if !encrypted.Encrypted {
		return encrypted.Value, nil
	}

	if encrypted.Value == "" {
		return "", nil
	}

	ciphertext, err := base64.StdEncoding.DecodeString(encrypted.Value)
	if err != nil {
		return "", fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	nonce, err := base64.StdEncoding.DecodeString(encrypted.Nonce)
	if err != nil {
		return "", fmt.Errorf("failed to decode nonce: %w", err)
	}

	plaintext, err := s.gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt: %w", err)
	}

	return string(plaintext), nil
}

func (s *SecureStore) Clear() {
	if s.masterKey != nil {
		for i := range s.masterKey {
			s.masterKey[i] = 0
		}
		s.masterKey = nil
	}
	s.gcm = nil
}

func NewEncryptedValue(value string, encrypted bool) *EncryptedValue {
	return &EncryptedValue{
		Encrypted: encrypted,
		Value:     value,
	}
}

func IsPlaintext(value *EncryptedValue) bool {
	return value != nil && !value.Encrypted && value.Value != ""
}

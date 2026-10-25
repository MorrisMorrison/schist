package crypto

import (
	"bytes"
	"encoding/base64"
	"testing"
)

func newKeyStore(t *testing.T, key byte) *SecureStore {
	t.Helper()
	store, err := NewSecureStoreWithKey(bytes.Repeat([]byte{key}, keyLength), []byte("salt"))
	if err != nil {
		t.Fatalf("NewSecureStoreWithKey: %v", err)
	}
	return store
}

func TestNewSecureStoreWithKeyRejectsWrongKeyLength(t *testing.T) {
	for _, n := range []int{0, 16, 31, 33, 64} {
		if _, err := NewSecureStoreWithKey(make([]byte, n), nil); err == nil {
			t.Errorf("key of %d bytes: want error", n)
		}
	}
}

func TestEncryptEmptyStringIsNotASecret(t *testing.T) {
	v, err := newKeyStore(t, 1).Encrypt("")
	if err != nil {
		t.Fatal(err)
	}
	if v.Encrypted || v.Value != "" || IsPlaintext(v) {
		t.Errorf("empty value = %+v, want unencrypted empty and not counted as plaintext secret", v)
	}
}

// Decryption must fail closed: anything not produced by this key is an error,
// never garbage plaintext.
func TestDecryptFailsClosed(t *testing.T) {
	store := newKeyStore(t, 1)
	good, err := store.Encrypt("top secret")
	if err != nil {
		t.Fatal(err)
	}

	flip := func(s string) string {
		b, _ := base64.StdEncoding.DecodeString(s)
		b[0] ^= 0xff
		return base64.StdEncoding.EncodeToString(b)
	}

	tests := []struct {
		name  string
		store *SecureStore
		value *EncryptedValue
	}{
		{"wrong key", newKeyStore(t, 2), good},
		{"tampered ciphertext", store, &EncryptedValue{Encrypted: true, Value: flip(good.Value), Nonce: good.Nonce}},
		{"tampered nonce", store, &EncryptedValue{Encrypted: true, Value: good.Value, Nonce: flip(good.Nonce)}},
		{"nonce not base64", store, &EncryptedValue{Encrypted: true, Value: good.Value, Nonce: "%%%"}},
		{"truncated nonce", store, &EncryptedValue{Encrypted: true, Value: good.Value, Nonce: "AAAA"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := func() (s string, err error) {
				defer func() {
					if r := recover(); r != nil {
						t.Fatalf("Decrypt panicked: %v", r)
					}
				}()
				return tt.store.Decrypt(tt.value)
			}()
			if err == nil {
				t.Errorf("want error, got plaintext %q", got)
			}
		})
	}
}

func TestDecryptEncryptedEmptyValue(t *testing.T) {
	got, err := newKeyStore(t, 1).Decrypt(&EncryptedValue{Encrypted: true})
	if err != nil || got != "" {
		t.Errorf("Decrypt(empty encrypted) = %q, %v; want \"\", nil", got, err)
	}
}

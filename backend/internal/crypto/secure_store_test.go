package crypto

import (
	"testing"
)

func TestGenerateSalt(t *testing.T) {
	salt1, err := GenerateSalt()
	if err != nil {
		t.Fatalf("GenerateSalt() failed: %v", err)
	}

	if len(salt1) != saltLength {
		t.Errorf("Expected salt length %d, got %d", saltLength, len(salt1))
	}

	salt2, err := GenerateSalt()
	if err != nil {
		t.Fatalf("GenerateSalt() failed: %v", err)
	}

	if string(salt1) == string(salt2) {
		t.Error("Expected different salts, got identical ones")
	}
}

func TestNewSecureStore(t *testing.T) {
	salt, err := GenerateSalt()
	if err != nil {
		t.Fatalf("Failed to generate salt: %v", err)
	}

	store, err := NewSecureStore("test-password", salt)
	if err != nil {
		t.Fatalf("NewSecureStore() failed: %v", err)
	}

	if store == nil {
		t.Error("Expected non-nil store")
		return
	}

	if len(store.masterKey) != keyLength {
		t.Errorf("Expected master key length %d, got %d", keyLength, len(store.masterKey))
	}
}

func TestNewSecureStoreInvalidSalt(t *testing.T) {
	invalidSalt := []byte("too-short")
	_, err := NewSecureStore("test-password", invalidSalt)
	if err == nil {
		t.Error("Expected error for invalid salt length")
	}
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	salt, err := GenerateSalt()
	if err != nil {
		t.Fatalf("Failed to generate salt: %v", err)
	}

	store, err := NewSecureStore("test-password", salt)
	if err != nil {
		t.Fatalf("NewSecureStore() failed: %v", err)
	}
	defer store.Clear()

	testCases := []string{
		"simple-secret",
		"complex-secret-with-special-chars!@#$%^&*()",
		"",
		"very-long-secret-" + string(make([]byte, 1000)),
		"unicode-secret-🔐🗝️",
	}

	for _, plaintext := range testCases {
		t.Run("encrypt_decrypt_"+plaintext[:min(10, len(plaintext))], func(t *testing.T) {
			encrypted, err := store.Encrypt(plaintext)
			if err != nil {
				t.Fatalf("Encrypt() failed: %v", err)
			}

			if plaintext == "" {
				if encrypted.Encrypted {
					t.Error("Expected empty string to not be encrypted")
				}
				if encrypted.Value != "" {
					t.Error("Expected empty encrypted value for empty input")
				}
				return
			}

			if !encrypted.Encrypted {
				t.Error("Expected encrypted flag to be true")
			}

			if encrypted.Value == "" {
				t.Error("Expected non-empty encrypted value")
			}

			if encrypted.Nonce == "" {
				t.Error("Expected non-empty nonce")
			}

			decrypted, err := store.Decrypt(encrypted)
			if err != nil {
				t.Fatalf("Decrypt() failed: %v", err)
			}

			if decrypted != plaintext {
				t.Errorf("Expected %q, got %q", plaintext, decrypted)
			}
		})
	}
}

func TestEncryptDifferentNonces(t *testing.T) {
	salt, err := GenerateSalt()
	if err != nil {
		t.Fatalf("Failed to generate salt: %v", err)
	}

	store, err := NewSecureStore("test-password", salt)
	if err != nil {
		t.Fatalf("NewSecureStore() failed: %v", err)
	}
	defer store.Clear()

	plaintext := "same-secret"

	encrypted1, err := store.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("First encrypt failed: %v", err)
	}

	encrypted2, err := store.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Second encrypt failed: %v", err)
	}

	if encrypted1.Value == encrypted2.Value {
		t.Error("Expected different encrypted values (different nonces)")
	}

	if encrypted1.Nonce == encrypted2.Nonce {
		t.Error("Expected different nonces")
	}

	decrypted1, _ := store.Decrypt(encrypted1)
	decrypted2, _ := store.Decrypt(encrypted2)

	if decrypted1 != plaintext || decrypted2 != plaintext {
		t.Error("Both encrypted values should decrypt to same plaintext")
	}
}

func TestDecryptPlaintextValue(t *testing.T) {
	salt, err := GenerateSalt()
	if err != nil {
		t.Fatalf("Failed to generate salt: %v", err)
	}

	store, err := NewSecureStore("test-password", salt)
	if err != nil {
		t.Fatalf("NewSecureStore() failed: %v", err)
	}
	defer store.Clear()

	plainValue := &EncryptedValue{
		Encrypted: false,
		Value:     "plaintext-secret",
	}

	decrypted, err := store.Decrypt(plainValue)
	if err != nil {
		t.Fatalf("Decrypt() of plaintext failed: %v", err)
	}

	if decrypted != "plaintext-secret" {
		t.Errorf("Expected %q, got %q", "plaintext-secret", decrypted)
	}
}

func TestDecryptNilValue(t *testing.T) {
	salt, err := GenerateSalt()
	if err != nil {
		t.Fatalf("Failed to generate salt: %v", err)
	}

	store, err := NewSecureStore("test-password", salt)
	if err != nil {
		t.Fatalf("NewSecureStore() failed: %v", err)
	}
	defer store.Clear()

	decrypted, err := store.Decrypt(nil)
	if err != nil {
		t.Fatalf("Decrypt() of nil failed: %v", err)
	}

	if decrypted != "" {
		t.Errorf("Expected empty string, got %q", decrypted)
	}
}

func TestDecryptInvalidBase64(t *testing.T) {
	salt, err := GenerateSalt()
	if err != nil {
		t.Fatalf("Failed to generate salt: %v", err)
	}

	store, err := NewSecureStore("test-password", salt)
	if err != nil {
		t.Fatalf("NewSecureStore() failed: %v", err)
	}
	defer store.Clear()

	invalidValue := &EncryptedValue{
		Encrypted: true,
		Value:     "invalid-base64-!@#$",
		Nonce:     "valid-base64",
	}

	_, err = store.Decrypt(invalidValue)
	if err == nil {
		t.Error("Expected error for invalid base64 ciphertext")
	}
}

func TestNewEncryptedValue(t *testing.T) {
	plainValue := NewEncryptedValue("test-value", false)
	if plainValue.Encrypted {
		t.Error("Expected encrypted to be false")
	}
	if plainValue.Value != "test-value" {
		t.Errorf("Expected value %q, got %q", "test-value", plainValue.Value)
	}

	encryptedValue := NewEncryptedValue("encrypted-value", true)
	if !encryptedValue.Encrypted {
		t.Error("Expected encrypted to be true")
	}
	if encryptedValue.Value != "encrypted-value" {
		t.Errorf("Expected value %q, got %q", "encrypted-value", encryptedValue.Value)
	}
}

func TestIsPlaintext(t *testing.T) {
	testCases := []struct {
		name     string
		value    *EncryptedValue
		expected bool
	}{
		{
			name:     "nil value",
			value:    nil,
			expected: false,
		},
		{
			name: "plaintext with value",
			value: &EncryptedValue{
				Encrypted: false,
				Value:     "test-value",
			},
			expected: true,
		},
		{
			name: "encrypted value",
			value: &EncryptedValue{
				Encrypted: true,
				Value:     "encrypted-value",
			},
			expected: false,
		},
		{
			name: "plaintext empty value",
			value: &EncryptedValue{
				Encrypted: false,
				Value:     "",
			},
			expected: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := IsPlaintext(tc.value)
			if result != tc.expected {
				t.Errorf("Expected %v, got %v", tc.expected, result)
			}
		})
	}
}

func TestStoreClear(t *testing.T) {
	salt, err := GenerateSalt()
	if err != nil {
		t.Fatalf("Failed to generate salt: %v", err)
	}

	store, err := NewSecureStore("test-password", salt)
	if err != nil {
		t.Fatalf("NewSecureStore() failed: %v", err)
	}

	if len(store.masterKey) == 0 {
		t.Error("Expected non-empty master key before clear")
	}

	store.Clear()

	if store.masterKey != nil {
		t.Error("Expected master key to be nil after clear")
	}

	if store.gcm != nil {
		t.Error("Expected GCM to be nil after clear")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

package crypto

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"unicode"
)

const (
	// MinJWTSecretLength defines the minimum required length for JWT secrets (32 bytes = 256 bits)
	MinJWTSecretLength = 32
	// RecommendedJWTSecretLength is the recommended length for JWT secrets (64 bytes = 512 bits)
	RecommendedJWTSecretLength = 64
)

var (
	ErrJWTSecretTooShort   = errors.New("JWT secret must be at least 32 bytes long")
	ErrJWTSecretLowEntropy = errors.New("JWT secret has insufficient entropy")
	ErrJWTSecretGeneration = errors.New("failed to generate secure JWT secret")
)

// GenerateJWTSecret generates a cryptographically secure random JWT secret
func GenerateJWTSecret() (string, error) {
	secretBytes := make([]byte, RecommendedJWTSecretLength)
	_, err := rand.Read(secretBytes)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrJWTSecretGeneration, err)
	}
	return base64.URLEncoding.EncodeToString(secretBytes), nil
}

// ValidateJWTSecret validates that a JWT secret meets security requirements
func ValidateJWTSecret(secret string, isProduction bool) error {
	if len(secret) < MinJWTSecretLength {
		return ErrJWTSecretTooShort
	}

	// In production, enforce stricter entropy requirements
	if isProduction {
		if err := validateEntropy(secret); err != nil {
			return err
		}
	}

	return nil
}

// validateEntropy performs basic entropy checks on the secret
func validateEntropy(secret string) error {
	// Check for common weak patterns
	if isCommonWeakSecret(secret) {
		return ErrJWTSecretLowEntropy
	}

	// Calculate basic entropy metrics
	if calculateShannonEntropy(secret) < 3.0 {
		return ErrJWTSecretLowEntropy
	}

	return nil
}

// isCommonWeakSecret checks for obviously weak secrets
func isCommonWeakSecret(secret string) bool {
	weak := []string{
		"secret", "password", "admin", "root", "test", "development", "dev",
		"prod", "production", "key", "jwt", "token", "auth", "login",
		"12345", "123456", "password123", "admin123",
	}

	secretLower := toLower(secret)
	for _, w := range weak {
		if secretLower == w {
			return true
		}
	}

	// Check for simple patterns like repeated characters
	if isRepeatedPattern(secret) {
		return true
	}

	return false
}

// toLower converts string to lowercase without allocating
func toLower(s string) string {
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		result[i] = byte(unicode.ToLower(rune(s[i])))
	}
	return string(result)
}

// isRepeatedPattern checks for simple repeated character patterns
func isRepeatedPattern(secret string) bool {
	if len(secret) < 3 {
		return false
	}

	// Check if more than 50% of characters are the same
	charCounts := make(map[rune]int)
	for _, r := range secret {
		charCounts[r]++
	}

	maxCount := 0
	for _, count := range charCounts {
		if count > maxCount {
			maxCount = count
		}
	}

	return float64(maxCount)/float64(len(secret)) > 0.5
}

// calculateShannonEntropy calculates the Shannon entropy of a string
func calculateShannonEntropy(s string) float64 {
	if len(s) == 0 {
		return 0
	}

	// Count character frequencies
	freq := make(map[rune]int)
	for _, r := range s {
		freq[r]++
	}

	// Calculate entropy
	entropy := 0.0
	length := float64(len(s))
	for _, count := range freq {
		p := float64(count) / length
		if p > 0 {
			entropy -= p * log2(p)
		}
	}

	return entropy
}

// log2 calculates log base 2
func log2(x float64) float64 {
	if x <= 0 {
		return 0
	}
	return math.Log2(x)
}

package crypto

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"strings"
)

const (
	MinJWTSecretLength         = 32
	RecommendedJWTSecretLength = 64
)

var (
	ErrJWTSecretTooShort   = errors.New("JWT secret must be at least 32 bytes long")
	ErrJWTSecretLowEntropy = errors.New("JWT secret has insufficient entropy")
	ErrJWTSecretGeneration = errors.New("failed to generate secure JWT secret")
)

func GenerateJWTSecret() (string, error) {
	secretBytes := make([]byte, RecommendedJWTSecretLength)
	_, err := rand.Read(secretBytes)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrJWTSecretGeneration, err)
	}
	return base64.URLEncoding.EncodeToString(secretBytes), nil
}

func ValidateJWTSecret(secret string, isProduction bool) error {
	if len(secret) < MinJWTSecretLength {
		return ErrJWTSecretTooShort
	}

	if isProduction {
		if err := validateEntropy(secret); err != nil {
			return err
		}
	}

	return nil
}

func validateEntropy(secret string) error {
	if isCommonWeakSecret(secret) {
		return ErrJWTSecretLowEntropy
	}

	if calculateShannonEntropy(secret) < 3.0 {
		return ErrJWTSecretLowEntropy
	}

	return nil
}

func isCommonWeakSecret(secret string) bool {
	weak := []string{
		"secret", "password", "admin", "root", "test", "development", "dev",
		"prod", "production", "key", "jwt", "token", "auth", "login",
		"12345", "123456", "password123", "admin123",
	}

	secretLower := strings.ToLower(secret)
	for _, w := range weak {
		if secretLower == w {
			return true
		}
	}

	return isRepeatedPattern(secret)
}

func isRepeatedPattern(secret string) bool {
	if len(secret) < 3 {
		return false
	}

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

func calculateShannonEntropy(s string) float64 {
	if len(s) == 0 {
		return 0
	}

	freq := make(map[rune]int)
	for _, r := range s {
		freq[r]++
	}

	entropy := 0.0
	length := float64(len(s))
	for _, count := range freq {
		p := float64(count) / length
		if p > 0 {
			entropy -= p * math.Log2(p)
		}
	}

	return entropy
}

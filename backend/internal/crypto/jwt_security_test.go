package crypto

import (
	"strings"
	"testing"
)

func TestGenerateJWTSecret(t *testing.T) {
	secret, err := GenerateJWTSecret()
	if err != nil {
		t.Fatalf("GenerateJWTSecret() failed: %v", err)
	}

	if len(secret) == 0 {
		t.Error("Generated secret is empty")
	}

	// Decode the base64 to check actual byte length
	decodedLen := len(secret) * 3 / 4 // Approximate decoded length
	if decodedLen < RecommendedJWTSecretLength {
		t.Errorf("Generated secret is too short: %d bytes (expected at least %d)",
			decodedLen, RecommendedJWTSecretLength)
	}

	// Generate multiple secrets to ensure randomness
	secret2, err := GenerateJWTSecret()
	if err != nil {
		t.Fatalf("GenerateJWTSecret() second call failed: %v", err)
	}

	if secret == secret2 {
		t.Error("Generated secrets are identical (should be random)")
	}
}

func TestValidateJWTSecret(t *testing.T) {
	tests := []struct {
		name         string
		secret       string
		isProduction bool
		wantErr      bool
		expectedErr  error
	}{
		{
			name:         "valid secret development",
			secret:       strings.Repeat("a", MinJWTSecretLength),
			isProduction: false,
			wantErr:      false,
		},
		{
			name:         "valid secret production",
			secret:       "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4",
			isProduction: true,
			wantErr:      false,
		},
		{
			name:        "too short secret",
			secret:      "short",
			wantErr:     true,
			expectedErr: ErrJWTSecretTooShort,
		},
		{
			name:         "weak secret in production",
			secret:       "secret" + strings.Repeat("x", MinJWTSecretLength),
			isProduction: true,
			wantErr:      true,
			expectedErr:  ErrJWTSecretLowEntropy,
		},
		{
			name:         "weak secret in development is ok",
			secret:       "secret" + strings.Repeat("x", MinJWTSecretLength),
			isProduction: false,
			wantErr:      false,
		},
		{
			name:         "repeated pattern in production",
			secret:       strings.Repeat("abc", MinJWTSecretLength/3+1),
			isProduction: true,
			wantErr:      true,
			expectedErr:  ErrJWTSecretLowEntropy,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateJWTSecret(tt.secret, tt.isProduction)
			if tt.wantErr {
				if err == nil {
					t.Error("ValidateJWTSecret() expected error but got none")
					return
				}
				if tt.expectedErr != nil && err != tt.expectedErr {
					t.Errorf("ValidateJWTSecret() error = %v, want %v", err, tt.expectedErr)
				}
			} else {
				if err != nil {
					t.Errorf("ValidateJWTSecret() unexpected error = %v", err)
				}
			}
		})
	}
}

func TestIsCommonWeakSecret(t *testing.T) {
	tests := []struct {
		name   string
		secret string
		want   bool
	}{
		{"common weak - secret", "secret", true},
		{"common weak - password", "password", true},
		{"common weak - admin", "admin", true},
		{"common weak - 123456", "123456", true},
		{"case insensitive", "SECRET", true},
		{"strong secret", "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4", false},
		{"not in list", "randomstrongpassword", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isCommonWeakSecret(tt.secret); got != tt.want {
				t.Errorf("isCommonWeakSecret() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsRepeatedPattern(t *testing.T) {
	tests := []struct {
		name   string
		secret string
		want   bool
	}{
		{"repeated character", "aaaaaaaaaa", true},
		{"mostly repeated", "aaaaaaaaab", true},
		{"diverse characters", "abcdefghij", false},
		{"empty string", "", false},
		{"short string", "ab", false},
		{"balanced repetition", "abababab", false}, // 50% each, not > 50%
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isRepeatedPattern(tt.secret); got != tt.want {
				t.Errorf("isRepeatedPattern() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalculateShannonEntropy(t *testing.T) {
	tests := []struct {
		name       string
		input      string
		minEntropy float64
	}{
		{"empty string", "", 0},
		{"single character", "aaaa", 0},
		{"two characters equal", "abab", 1.0},
		{"diverse string", "abcdefgh", 3.0},
		{"very diverse", "aB3$5fG8*9kL2&mN7@pQ4#rS", 4.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entropy := calculateShannonEntropy(tt.input)
			if entropy < tt.minEntropy {
				t.Errorf("calculateShannonEntropy() = %v, want at least %v", entropy, tt.minEntropy)
			}
		})
	}
}

func TestValidateEntropyIntegration(t *testing.T) {
	// Test with generated secret should pass
	secret, err := GenerateJWTSecret()
	if err != nil {
		t.Fatalf("Failed to generate secret: %v", err)
	}

	err = validateEntropy(secret)
	if err != nil {
		t.Errorf("Generated secret failed entropy validation: %v", err)
	}
}

func BenchmarkGenerateJWTSecret(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_, err := GenerateJWTSecret()
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkValidateJWTSecret(b *testing.B) {
	secret := "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4"
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_ = ValidateJWTSecret(secret, true)
	}
}

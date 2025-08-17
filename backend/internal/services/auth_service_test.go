package services

import (
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/golang-jwt/jwt/v5"
)

func TestAuthService_ValidateToken(t *testing.T) {
	// Create a test config with a secure JWT secret
	cfg := &config.Config{
		JWTSecret:      "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4",
		JWTExpiryHours: 24,
	}

	// Mock user service (we only need AuthService for these tests)
	authService := NewAuthService(cfg, nil)

	tests := []struct {
		name      string
		token     string
		wantError bool
		wantUser  string
	}{
		{
			name:      "valid token",
			token:     createValidToken(cfg.JWTSecret, "testuser", time.Now().Add(time.Hour)),
			wantError: false,
			wantUser:  "testuser",
		},
		{
			name:      "expired token",
			token:     createValidToken(cfg.JWTSecret, "testuser", time.Now().Add(-time.Hour)),
			wantError: true,
		},
		{
			name:      "invalid signature",
			token:     createValidToken("wrongsecret", "testuser", time.Now().Add(time.Hour)),
			wantError: true,
		},
		{
			name:      "malformed token",
			token:     "not.a.token",
			wantError: true,
		},
		{
			name:      "empty token",
			token:     "",
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			username, err := authService.ValidateToken(tt.token)

			if tt.wantError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if username != tt.wantUser {
				t.Errorf("Expected username %s, got %s", tt.wantUser, username)
			}
		})
	}
}

func TestAuthService_GenerateJWT(t *testing.T) {
	cfg := &config.Config{
		JWTSecret:      "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4",
		JWTExpiryHours: 24,
	}

	authService := NewAuthService(cfg, nil)

	tests := []struct {
		name     string
		username string
	}{
		{
			name:     "generate token for user",
			username: "testuser",
		},
		{
			name:     "generate token for another user",
			username: "anotheruser",
		},
		{
			name:     "generate token for user with special characters",
			username: "user@example.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, err := authService.generateJWT(tt.username)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if token == "" {
				t.Error("Expected non-empty token")
				return
			}

			// Validate the token can be parsed back
			username, err := authService.ValidateToken(token)
			if err != nil {
				t.Errorf("Generated token failed validation: %v", err)
				return
			}

			if username != tt.username {
				t.Errorf("Token validation returned wrong username: expected %s, got %s", tt.username, username)
			}
		})
	}
}

func TestAuthService_TokenExpiry(t *testing.T) {
	cfg := &config.Config{
		JWTSecret:      "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4",
		JWTExpiryHours: 1, // 1 hour expiry for testing
	}

	authService := NewAuthService(cfg, nil)

	// Generate a token
	token, err := authService.generateJWT("testuser")
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	// Parse the token to check expiry
	parsedToken, err := jwt.ParseWithClaims(token, &Claims{}, func(token *jwt.Token) (any, error) {
		return []byte(cfg.JWTSecret), nil
	})
	if err != nil {
		t.Fatalf("Failed to parse token: %v", err)
	}

	claims, ok := parsedToken.Claims.(*Claims)
	if !ok {
		t.Fatal("Failed to extract claims")
	}

	// Check that expiry is set correctly (should be ~1 hour from now)
	expectedExpiry := time.Now().Add(time.Hour)
	actualExpiry := claims.ExpiresAt.Time

	timeDiff := actualExpiry.Sub(expectedExpiry)
	if timeDiff > time.Minute || timeDiff < -time.Minute {
		t.Errorf("Token expiry not set correctly: expected around %v, got %v", expectedExpiry, actualExpiry)
	}

	// Check issuer
	if claims.Issuer != "schist" {
		t.Errorf("Expected issuer 'schist', got %s", claims.Issuer)
	}

	// Check username
	if claims.Username != "testuser" {
		t.Errorf("Expected username 'testuser', got %s", claims.Username)
	}
}

func TestAuthService_DifferentSecrets(t *testing.T) {
	secret1 := "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4"
	secret2 := "xY7*2kQ9#5mP8@nR3&tW6%vZ1!aC4^bF0+dG7-eH5=iJ2~sK8"

	cfg1 := &config.Config{JWTSecret: secret1, JWTExpiryHours: 24}
	cfg2 := &config.Config{JWTSecret: secret2, JWTExpiryHours: 24}

	authService1 := NewAuthService(cfg1, nil)
	authService2 := NewAuthService(cfg2, nil)

	// Generate token with first service
	token, err := authService1.generateJWT("testuser")
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	// First service should validate successfully
	username, err := authService1.ValidateToken(token)
	if err != nil {
		t.Errorf("Token validation failed with same service: %v", err)
	}
	if username != "testuser" {
		t.Errorf("Expected username 'testuser', got %s", username)
	}

	// Second service should reject the token (different secret)
	_, err = authService2.ValidateToken(token)
	if err == nil {
		t.Error("Expected token validation to fail with different secret")
	}
}

func TestAuthService_TokenRoundTrip(t *testing.T) {
	cfg := &config.Config{
		JWTSecret:      "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4",
		JWTExpiryHours: 24,
	}

	authService := NewAuthService(cfg, nil)

	users := []string{"user1", "user2", "admin@example.com", "test_user_123"}

	for _, user := range users {
		t.Run("roundtrip_"+user, func(t *testing.T) {
			// Generate token
			token, err := authService.generateJWT(user)
			if err != nil {
				t.Fatalf("Failed to generate token for %s: %v", user, err)
			}

			// Validate token
			username, err := authService.ValidateToken(token)
			if err != nil {
				t.Fatalf("Failed to validate token for %s: %v", user, err)
			}

			if username != user {
				t.Errorf("Username mismatch: expected %s, got %s", user, username)
			}
		})
	}
}

func BenchmarkAuthService_GenerateJWT(b *testing.B) {
	cfg := &config.Config{
		JWTSecret:      "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4",
		JWTExpiryHours: 24,
	}

	authService := NewAuthService(cfg, nil)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := authService.generateJWT("testuser")
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkAuthService_ValidateToken(b *testing.B) {
	cfg := &config.Config{
		JWTSecret:      "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4",
		JWTExpiryHours: 24,
	}

	authService := NewAuthService(cfg, nil)

	// Generate a token for testing
	token, err := authService.generateJWT("testuser")
	if err != nil {
		b.Fatal(err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := authService.ValidateToken(token)
		if err != nil {
			b.Fatal(err)
		}
	}
}

// Helper function to create test tokens
func createValidToken(secret, username string, expiry time.Time) string {
	claims := Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiry),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "schist",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString([]byte(secret))
	return tokenString
}

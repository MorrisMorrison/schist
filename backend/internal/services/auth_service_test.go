package services

import (
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

func TestAuthService_GetUser(t *testing.T) {
	testDir := t.TempDir()

	userService := NewUserService(testDir)
	cfg := &config.Config{
		JWTSecret:      "test-secret",
		JWTExpiryHours: 24,
	}
	authService := NewAuthService(cfg, userService)

	t.Run("returns error for empty username", func(t *testing.T) {
		_, err := authService.GetUser("")
		assert.Error(t, err)
	})

	t.Run("returns error for non-existent user", func(t *testing.T) {
		_, err := authService.GetUser("non-existent")
		assert.Error(t, err)
	})

	t.Run("returns user for existing username", func(t *testing.T) {
		// Create first user
		err := userService.CreateFirstUser("testuser", "credential-123")
		require.NoError(t, err)

		user, err := authService.GetUser("testuser")
		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "testuser", user.Username)
	})
}

func TestAuthService_IsFirstSetup(t *testing.T) {
	testDir := t.TempDir()

	userService := NewUserService(testDir)
	cfg := &config.Config{
		JWTSecret:      "test-secret",
		JWTExpiryHours: 24,
	}
	authService := NewAuthService(cfg, userService)

	t.Run("returns true when no users exist", func(t *testing.T) {
		isFirstSetup, err := authService.IsFirstSetup()
		assert.NoError(t, err)
		assert.True(t, isFirstSetup)
	})

	t.Run("returns false when users exist", func(t *testing.T) {
		// Create first user
		err := userService.CreateFirstUser("testuser", "credential-123")
		require.NoError(t, err)

		isFirstSetup, err := authService.IsFirstSetup()
		assert.NoError(t, err)
		assert.False(t, isFirstSetup)
	})
}

func TestAuthService_CreateFirstUser(t *testing.T) {
	testDir := t.TempDir()

	userService := NewUserService(testDir)
	cfg := &config.Config{
		JWTSecret:      "test-secret",
		JWTExpiryHours: 24,
	}
	authService := NewAuthService(cfg, userService)

	t.Run("creates first user successfully", func(t *testing.T) {
		err := authService.CreateFirstUser("admin", "credential-123")
		assert.NoError(t, err)

		// Verify user was created
		user, err := authService.GetUser("admin")
		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "admin", user.Username)
		// Note: AuthService User struct doesn't have IsAdmin field
		// This is expected behavior - AuthService returns a simplified User struct
	})

	t.Run("fails when users already exist", func(t *testing.T) {
		// This test uses a fresh service since the previous test already created a user
		testDir2 := t.TempDir()

		userService2 := NewUserService(testDir2)
		authService2 := NewAuthService(cfg, userService2)

		// Create first user
		err := authService2.CreateFirstUser("admin", "credential-123")
		require.NoError(t, err)

		// Try to create first user again
		err = authService2.CreateFirstUser("admin2", "credential-456")
		assert.Error(t, err)
	})
}

func TestAuthService_GenerateInviteToken(t *testing.T) {
	testDir := t.TempDir()

	userService := NewUserService(testDir)
	cfg := &config.Config{
		JWTSecret:      "test-secret",
		JWTExpiryHours: 24,
	}
	authService := NewAuthService(cfg, userService)

	t.Run("generates invite token", func(t *testing.T) {
		token, err := authService.GenerateInviteToken("admin")
		assert.NoError(t, err)
		assert.NotEmpty(t, token)
		assert.Len(t, token, 64) // 32 bytes hex-encoded
	})

	t.Run("generates unique tokens", func(t *testing.T) {
		token1, err := authService.GenerateInviteToken("admin")
		require.NoError(t, err)

		token2, err := authService.GenerateInviteToken("admin")
		require.NoError(t, err)

		assert.NotEqual(t, token1, token2)
	})
}

func TestAuthService_CreateUserFromInvite(t *testing.T) {
	testDir := t.TempDir()

	userService := NewUserService(testDir)
	cfg := &config.Config{
		JWTSecret:      "test-secret",
		JWTExpiryHours: 24,
	}
	authService := NewAuthService(cfg, userService)

	// Create admin user to generate invite tokens
	err := userService.CreateFirstUser("admin", "admin-credential")
	require.NoError(t, err)

	t.Run("creates user with valid invite token", func(t *testing.T) {
		// Generate invite token
		token, err := authService.GenerateInviteToken("admin")
		require.NoError(t, err)

		// Create user from invite
		err = authService.CreateUserFromInvite(token, "newuser", "user-credential")
		assert.NoError(t, err)

		// Verify user was created
		user, err := authService.GetUser("newuser")
		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "newuser", user.Username)
		// Note: AuthService User struct doesn't have IsAdmin field
		// This is expected behavior - AuthService returns a simplified User struct
	})

	t.Run("fails with invalid invite token", func(t *testing.T) {
		err := authService.CreateUserFromInvite("invalid-token", "baduser", "user-credential")
		assert.Error(t, err)
	})
}

func TestAuthService_LoginWithPasskey(t *testing.T) {
	testDir := t.TempDir()

	userService := NewUserService(testDir)
	cfg := &config.Config{
		JWTSecret:      "test-secret",
		JWTExpiryHours: 24,
	}
	authService := NewAuthService(cfg, userService)

	// Create a test user
	err := userService.CreateFirstUser("testuser", "credential-123")
	require.NoError(t, err)

	t.Run("issuing a ticket for unknown credential fails", func(t *testing.T) {
		_, err := authService.IssueAuthTicket("non-existent-credential")
		assert.Error(t, err)
	})

	t.Run("exchanging an unknown ticket fails", func(t *testing.T) {
		_, err := authService.LoginWithPasskeyTicket("not-a-real-ticket")
		assert.Error(t, err)
	})

	t.Run("verified ticket exchanges for a valid token", func(t *testing.T) {
		// A ticket is only issued after a verified assertion (here simulated by
		// calling IssueAuthTicket directly with a known-good credential).
		ticket, err := authService.IssueAuthTicket("credential-123")
		require.NoError(t, err)
		require.NotEmpty(t, ticket)

		resp, err := authService.LoginWithPasskeyTicket(ticket)
		assert.NoError(t, err)
		require.NotNil(t, resp)
		assert.NotEmpty(t, resp.Token)

		// Verify token is valid
		username, err := authService.ValidateToken(resp.Token)
		assert.NoError(t, err)
		assert.Equal(t, "testuser", username)
	})

	t.Run("tickets are single-use", func(t *testing.T) {
		ticket, err := authService.IssueAuthTicket("credential-123")
		require.NoError(t, err)

		_, err = authService.LoginWithPasskeyTicket(ticket)
		require.NoError(t, err)

		// Second exchange must fail.
		_, err = authService.LoginWithPasskeyTicket(ticket)
		assert.Error(t, err)
	})
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

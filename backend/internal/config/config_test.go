package config

import (
	"os"
	"strings"
	"testing"
)

func TestValidateAndLoadJWTSecret(t *testing.T) {
	// Store original value to restore later
	originalSecret := os.Getenv("SCHIST_JWT_SECRET")
	defer func() {
		if originalSecret != "" {
			os.Setenv("SCHIST_JWT_SECRET", originalSecret)
		} else {
			os.Unsetenv("SCHIST_JWT_SECRET")
		}
	}()

	tests := []struct {
		name          string
		envSecret     string
		environment   string
		wantError     bool
		wantGenerated bool
	}{
		{
			name:          "no secret in development generates one",
			envSecret:     "",
			environment:   "development",
			wantError:     false,
			wantGenerated: true,
		},
		{
			name:        "no secret in production errors",
			envSecret:   "",
			environment: "production",
			wantError:   true,
		},
		{
			name:        "secure secret in production",
			envSecret:   "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4",
			environment: "production",
			wantError:   false,
		},
		{
			name:        "insecure secret in production errors",
			envSecret:   "secret",
			environment: "production",
			wantError:   true,
		},
		{
			name:          "insecure secret in development gets replaced",
			envSecret:     "secret",
			environment:   "development",
			wantError:     false,
			wantGenerated: true,
		},
		{
			name:        "weak secret in development warns but allows",
			envSecret:   strings.Repeat("a", 32),
			environment: "development",
			wantError:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Set up environment
			if tt.envSecret == "" {
				os.Unsetenv("SCHIST_JWT_SECRET")
			} else {
				os.Setenv("SCHIST_JWT_SECRET", tt.envSecret)
			}

			result, err := validateAndLoadJWTSecret(tt.environment)

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

			if result.Secret == "" {
				t.Error("Expected non-empty secret")
			}

			if tt.wantGenerated && !result.Generated {
				t.Error("Expected secret to be generated")
			}

			// For "secret" default in development, should be replaced
			if tt.envSecret == "secret" && tt.environment == "development" {
				if result.Secret == "secret" {
					t.Error("Expected insecure default to be replaced")
				}
			}

			// Generated secrets should be reasonably long
			if tt.envSecret == "" && len(result.Secret) < 32 {
				t.Errorf("Generated secret too short: %d", len(result.Secret))
			}
		})
	}
}

func TestLoadConfig(t *testing.T) {
	// Store original values
	originalSecret := os.Getenv("SCHIST_JWT_SECRET")
	originalEnv := os.Getenv("ENV")

	defer func() {
		if originalSecret != "" {
			os.Setenv("SCHIST_JWT_SECRET", originalSecret)
		} else {
			os.Unsetenv("SCHIST_JWT_SECRET")
		}
		if originalEnv != "" {
			os.Setenv("ENV", originalEnv)
		} else {
			os.Unsetenv("ENV")
		}
	}()

	// Only test scenarios that don't cause log.Fatalf
	tests := []struct {
		name        string
		envSecret   string
		environment string
	}{
		{
			name:        "development with secure secret",
			envSecret:   "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4",
			environment: "development",
		},
		{
			name:        "development with no secret generates one",
			envSecret:   "",
			environment: "development",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Set up environment
			os.Setenv("ENV", tt.environment)
			if tt.envSecret == "" {
				os.Unsetenv("SCHIST_JWT_SECRET")
			} else {
				os.Setenv("SCHIST_JWT_SECRET", tt.envSecret)
			}

			config, err := Load()

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}
			if config == nil {
				t.Error("Expected non-nil config")
				return
			}
			if config.JWTSecret == "" {
				t.Error("Expected non-empty JWT secret")
			}
			if config.Environment != tt.environment {
				t.Errorf("Expected environment %s, got %s", tt.environment, config.Environment)
			}
		})
	}
}

func TestConfigMethods(t *testing.T) {
	tests := []struct {
		name        string
		environment string
		wantDev     bool
	}{
		{"development environment", "development", true},
		{"production environment", "production", false},
		{"test environment", "test", false},
		{"empty environment", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := &Config{Environment: tt.environment}
			if got := config.IsDevelopment(); got != tt.wantDev {
				t.Errorf("IsDevelopment() = %v, want %v", got, tt.wantDev)
			}
		})
	}
}

func TestGetPort(t *testing.T) {
	tests := []struct {
		name     string
		port     string
		expected int
	}{
		{"valid port", "8080", 8080},
		{"invalid port", "abc", 8080},
		{"empty port", "", 8080},
		{"zero port", "0", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := &Config{Port: tt.port}
			if got := config.GetPort(); got != tt.expected {
				t.Errorf("GetPort() = %v, want %v", got, tt.expected)
			}
		})
	}
}

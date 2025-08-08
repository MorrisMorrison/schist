package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port        string
	DataDir     string
	Environment string
	StaticDir   string
	FrontendURL string

	RateLimitEnabled bool
	RateLimitRPM     int

	AuthEnabled    bool
	AuthUsers      map[string]string // username -> bcrypt hash
	JWTSecret      string
	JWTExpiryHours int

	SharingEnabled         bool
	ShareMaxExpiryDays     int
	ShareDefaultExpiryDays int
}

func Load() *Config {
	return &Config{
		Port:        getEnv("SCHIST_PORT", "8080"),
		DataDir:     getEnv("SCHIST_DATA_DIR", "data"),
		Environment: getEnv("ENV", "development"),
		StaticDir:   getEnv("SCHIST_STATIC_DIR", "./web"),
		FrontendURL: getEnv("SCHIST_FRONTEND_URL", "http://localhost:5173"),

		RateLimitEnabled: getEnvBool("SCHIST_RATE_LIMIT_ENABLED", false),
		RateLimitRPM:     getEnvInt("SCHIST_RATE_LIMIT_RPM", 100),

		AuthEnabled:    getEnvBool("SCHIST_AUTH_ENABLED", false),
		AuthUsers:      parseAuthUsers(getEnv("SCHIST_AUTH_USERS", "")),
		JWTSecret:      getEnv("SCHIST_JWT_SECRET", ""),
		JWTExpiryHours: getEnvInt("SCHIST_JWT_EXPIRY_HOURS", 24),

		SharingEnabled:         getEnvBool("SCHIST_SHARING_ENABLED", true),
		ShareMaxExpiryDays:     getEnvInt("SCHIST_SHARE_MAX_EXPIRY_DAYS", 90),
		ShareDefaultExpiryDays: getEnvInt("SCHIST_SHARE_DEFAULT_EXPIRY_DAYS", 7),
	}
}

func (c *Config) IsDevelopment() bool {
	return c.Environment == "development"
}

func (c *Config) GetPort() int {
	port, err := strconv.Atoi(c.Port)
	if err != nil {
		return 8080
	}
	return port
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		switch strings.ToLower(value) {
		case "true", "1", "yes", "on":
			return true
		case "false", "0", "no", "off":
			return false
		}
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func parseAuthUsers(userStr string) map[string]string {
	users := make(map[string]string)
	fmt.Printf("DEBUG: Parsing auth users from: %s\n", userStr)
	if userStr == "" {
		fmt.Printf("DEBUG: Empty user string\n")
		return users
	}

	pairs := strings.Split(userStr, ",")
	fmt.Printf("DEBUG: Found %d user pairs\n", len(pairs))
	for _, pair := range pairs {
		parts := strings.SplitN(strings.TrimSpace(pair), ":", 2)
		if len(parts) == 2 {
			username := strings.TrimSpace(parts[0])
			hash := strings.TrimSpace(parts[1])
			if username != "" && hash != "" {
				users[username] = hash
				fmt.Printf("DEBUG: Added user: %s with hash: %s\n", username, hash)
			}
		} else {
			fmt.Printf("DEBUG: Invalid pair format: %s\n", pair)
		}
	}
	return users
}

package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/MorrisMorrison/schist/internal/crypto"
)

type SecurityHeadersConfig struct {
	CSPEnabled          bool
	XFrameOptions       string
	XContentTypeOptions bool
	XXSSProtection      bool
	ReferrerPolicy      string
	PermissionsPolicy   string

	HSTSEnabled           bool
	HSTSMaxAge            int
	HSTSIncludeSubdomains bool
	HSTSPreload           bool

	CSPDefaultSrc string
	CSPScriptSrc  string
	CSPStyleSrc   string
	CSPImgSrc     string
	CSPFontSrc    string
	CSPConnectSrc string
	CSPFrameSrc   string
	CSPFormAction string
}

type Config struct {
	Port         string
	DataDir      string
	Environment  string
	StaticDir    string
	FrontendURL  string
	TemplatesDir string

	RateLimitEnabled   bool
	RateLimitRPM       int
	ShareRateLimitRPM  int
	AssetRateLimitRPM  int
	PublicRateLimitRPM int

	AuthEnabled    bool
	JWTSecret      string
	JWTExpiryHours int

	SharingEnabled         bool
	ShareMaxExpiryDays     int
	ShareDefaultExpiryDays int

	SecurityHeaders SecurityHeadersConfig
}

func Load() *Config {
	environment := getEnv("ENV", "development")
	jwtSecret := loadJWTSecret(environment)

	return &Config{
		Port:         getEnv("SCHIST_PORT", "8080"),
		DataDir:      getEnv("SCHIST_DATA_DIR", "data"),
		Environment:  environment,
		StaticDir:    getEnv("SCHIST_STATIC_DIR", "./web"),
		FrontendURL:  getEnv("SCHIST_FRONTEND_URL", "http://localhost:5173"),
		TemplatesDir: getEnv("SCHIST_TEMPLATES_DIR", "../../../templates"),

		RateLimitEnabled:   getEnvBool("SCHIST_RATE_LIMIT_ENABLED", environment != "development"),
		RateLimitRPM:       getEnvInt("SCHIST_RATE_LIMIT_RPM", 300),
		ShareRateLimitRPM:  getEnvInt("SCHIST_SHARE_RATE_LIMIT_RPM", 10),
		AssetRateLimitRPM:  getEnvInt("SCHIST_ASSET_RATE_LIMIT_RPM", 1200),
		PublicRateLimitRPM: getEnvInt("SCHIST_PUBLIC_RATE_LIMIT_RPM", 20),

		AuthEnabled:    getEnvBool("SCHIST_AUTH_ENABLED", true),
		JWTSecret:      jwtSecret,
		JWTExpiryHours: getEnvInt("SCHIST_JWT_EXPIRY_HOURS", 24),

		SharingEnabled:         getEnvBool("SCHIST_SHARING_ENABLED", true),
		ShareMaxExpiryDays:     getEnvInt("SCHIST_SHARE_MAX_EXPIRY_DAYS", 90),
		ShareDefaultExpiryDays: getEnvInt("SCHIST_SHARE_DEFAULT_EXPIRY_DAYS", 7),

		SecurityHeaders: loadSecurityHeadersConfig(),
	}
}

func loadSecurityHeadersConfig() SecurityHeadersConfig {
	return SecurityHeadersConfig{
		// General security headers - enabled by default with secure defaults
		CSPEnabled:          getEnvBool("SCHIST_CSP_ENABLED", true),
		XFrameOptions:       getEnv("SCHIST_X_FRAME_OPTIONS", "DENY"),
		XContentTypeOptions: getEnvBool("SCHIST_X_CONTENT_TYPE_OPTIONS", true),
		XXSSProtection:      getEnvBool("SCHIST_X_XSS_PROTECTION", true),
		ReferrerPolicy:      getEnv("SCHIST_REFERRER_POLICY", "strict-origin-when-cross-origin"),
		PermissionsPolicy:   getEnv("SCHIST_PERMISSIONS_POLICY", "geolocation=(), microphone=(), camera=()"),

		// HSTS configuration - secure defaults for production
		HSTSEnabled:           getEnvBool("SCHIST_HSTS_ENABLED", true),
		HSTSMaxAge:            getEnvInt("SCHIST_HSTS_MAX_AGE", 31536000), // 1 year
		HSTSIncludeSubdomains: getEnvBool("SCHIST_HSTS_INCLUDE_SUBDOMAINS", true),
		HSTSPreload:           getEnvBool("SCHIST_HSTS_PRELOAD", false),

		// CSP directives - Svelte-compatible defaults
		// Note: 'unsafe-inline' for script-src is required for SvelteKit's inline scripts
		CSPDefaultSrc: getEnv("SCHIST_CSP_DEFAULT_SRC", "'self'"),
		CSPScriptSrc:  getEnv("SCHIST_CSP_SCRIPT_SRC", "'self' 'unsafe-inline'"),
		CSPStyleSrc:   getEnv("SCHIST_CSP_STYLE_SRC", "'self' 'unsafe-inline'"),
		CSPImgSrc:     getEnv("SCHIST_CSP_IMG_SRC", "'self' data: https:"),
		CSPFontSrc:    getEnv("SCHIST_CSP_FONT_SRC", "'self' data:"),
		CSPConnectSrc: getEnv("SCHIST_CSP_CONNECT_SRC", "'self'"),
		CSPFrameSrc:   getEnv("SCHIST_CSP_FRAME_SRC", "'none'"),
		CSPFormAction: getEnv("SCHIST_CSP_FORM_ACTION", "'self'"),
	}
}

func loadJWTSecret(environment string) string {
	result, err := validateAndLoadJWTSecret(environment)
	if err != nil {
		log.Fatalf("JWT secret configuration error: %v", err)
	}
	return result.Secret
}

type JWTSecretResult struct {
	Secret    string
	Generated bool
	Warning   string
}

func validateAndLoadJWTSecret(environment string) (*JWTSecretResult, error) {
	secret := os.Getenv("SCHIST_JWT_SECRET")
	isProduction := environment != "development"

	if secret == "" {
		generated, err := crypto.GenerateJWTSecret()
		if err != nil {
			return nil, fmt.Errorf("failed to generate secure JWT secret: %w", err)
		}

		if isProduction {
			return nil, fmt.Errorf("JWT secret must be explicitly set in production via SCHIST_JWT_SECRET environment variable")
		}

		return &JWTSecretResult{
			Secret:    generated,
			Generated: true,
			Warning:   "Generated secure JWT secret for development (set SCHIST_JWT_SECRET to avoid regeneration)",
		}, nil
	}

	if err := crypto.ValidateJWTSecret(secret, isProduction); err != nil {
		if isProduction {
			return nil, fmt.Errorf("invalid JWT secret in production: %w", err)
		}

		if secret == "secret" {
			generated, genErr := crypto.GenerateJWTSecret()
			if genErr != nil {
				return nil, fmt.Errorf("failed to generate secure JWT secret: %w", genErr)
			}
			return &JWTSecretResult{
				Secret:    generated,
				Generated: true,
				Warning:   "Replaced insecure default JWT secret with secure generated one",
			}, nil
		}

		return &JWTSecretResult{
			Secret:  secret,
			Warning: fmt.Sprintf("JWT secret validation failed: %v", err),
		}, nil
	}

	return &JWTSecretResult{Secret: secret}, nil
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

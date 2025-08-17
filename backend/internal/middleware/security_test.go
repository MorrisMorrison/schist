package middleware

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/gin-gonic/gin"
)

func TestSecurityHeaders_DefaultConfiguration(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Create config with defaults
	cfg := &config.Config{
		Environment: "production",
		SecurityHeaders: config.SecurityHeadersConfig{
			CSPEnabled:            true,
			XFrameOptions:         "DENY",
			XContentTypeOptions:   true,
			XXSSProtection:        true,
			ReferrerPolicy:        "strict-origin-when-cross-origin",
			HSTSEnabled:           true,
			HSTSMaxAge:            31536000,
			HSTSIncludeSubdomains: true,
			HSTSPreload:           false,
			CSPDefaultSrc:         "'self'",
			CSPScriptSrc:          "'self'",
			CSPStyleSrc:           "'self' 'unsafe-inline'",
			CSPImgSrc:             "'self' data: https:",
			CSPFontSrc:            "'self' data:",
			CSPConnectSrc:         "'self'",
			CSPFrameSrc:           "'none'",
			CSPFormAction:         "'self'",
		},
	}

	router := gin.New()
	router.Use(SecurityMiddleware(cfg))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	// Test HTTP request (no HSTS)
	req := httptest.NewRequest("GET", "/test", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	// Verify basic security headers
	if resp.Header().Get("X-Frame-Options") != "DENY" {
		t.Errorf("Expected X-Frame-Options: DENY, got: %s", resp.Header().Get("X-Frame-Options"))
	}

	if resp.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("Expected X-Content-Type-Options: nosniff, got: %s", resp.Header().Get("X-Content-Type-Options"))
	}

	if resp.Header().Get("X-XSS-Protection") != "1; mode=block" {
		t.Errorf("Expected X-XSS-Protection: 1; mode=block, got: %s", resp.Header().Get("X-XSS-Protection"))
	}

	if resp.Header().Get("Referrer-Policy") != "strict-origin-when-cross-origin" {
		t.Errorf("Expected Referrer-Policy: strict-origin-when-cross-origin, got: %s", resp.Header().Get("Referrer-Policy"))
	}

	// Verify CSP header exists and contains expected directives
	csp := resp.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Error("Content-Security-Policy header is missing")
	}

	expectedDirectives := []string{
		"default-src 'self'",
		"script-src 'self'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https:",
		"object-src 'none'",
		"base-uri 'self'",
		"frame-ancestors 'none'",
	}

	for _, directive := range expectedDirectives {
		if !strings.Contains(csp, directive) {
			t.Errorf("CSP missing expected directive: %s. Full CSP: %s", directive, csp)
		}
	}

	// HSTS should not be present for HTTP requests
	if resp.Header().Get("Strict-Transport-Security") != "" {
		t.Errorf("HSTS header should not be present for HTTP requests, got: %s", resp.Header().Get("Strict-Transport-Security"))
	}
}

func TestSecurityHeaders_HTTPS_Request(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		Environment: "production",
		SecurityHeaders: config.SecurityHeadersConfig{
			HSTSEnabled:           true,
			HSTSMaxAge:            31536000,
			HSTSIncludeSubdomains: true,
			HSTSPreload:           true,
		},
	}

	router := gin.New()
	router.Use(SecurityMiddleware(cfg))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	// Create HTTPS request
	req := httptest.NewRequest("GET", "/test", nil)
	req.TLS = &tls.ConnectionState{} // Simulate HTTPS
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	// Verify HSTS header is present for HTTPS
	hsts := resp.Header().Get("Strict-Transport-Security")
	expectedHSTS := "max-age=31536000; includeSubDomains; preload"
	if hsts != expectedHSTS {
		t.Errorf("Expected HSTS: %s, got: %s", expectedHSTS, hsts)
	}
}

func TestSecurityHeaders_Development_Environment(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		Environment: "development",
		SecurityHeaders: config.SecurityHeadersConfig{
			HSTSEnabled: true,
		},
	}

	router := gin.New()
	router.Use(SecurityMiddleware(cfg))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	// Create HTTPS request in development
	req := httptest.NewRequest("GET", "/test", nil)
	req.TLS = &tls.ConnectionState{}
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	// HSTS should be disabled in development
	if resp.Header().Get("Strict-Transport-Security") != "" {
		t.Errorf("HSTS should be disabled in development, got: %s", resp.Header().Get("Strict-Transport-Security"))
	}
}

func TestSecurityHeaders_Disabled_Features(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		Environment: "production",
		SecurityHeaders: config.SecurityHeadersConfig{
			CSPEnabled:          false,
			XFrameOptions:       "",
			XContentTypeOptions: false,
			XXSSProtection:      false,
			ReferrerPolicy:      "",
			HSTSEnabled:         false,
		},
	}

	router := gin.New()
	router.Use(SecurityMiddleware(cfg))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	req := httptest.NewRequest("GET", "/test", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	// Verify headers are not set when disabled
	if resp.Header().Get("Content-Security-Policy") != "" {
		t.Error("CSP should be disabled")
	}

	if resp.Header().Get("X-Frame-Options") != "" {
		t.Error("X-Frame-Options should be disabled")
	}

	if resp.Header().Get("X-Content-Type-Options") != "" {
		t.Error("X-Content-Type-Options should be disabled")
	}

	if resp.Header().Get("X-XSS-Protection") != "" {
		t.Error("X-XSS-Protection should be disabled")
	}

	if resp.Header().Get("Referrer-Policy") != "" {
		t.Error("Referrer-Policy should be disabled")
	}
}

func TestSecurityHeaders_CustomCSP(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		SecurityHeaders: config.SecurityHeadersConfig{
			CSPEnabled:    true,
			CSPDefaultSrc: "'self' example.com",
			CSPScriptSrc:  "'self' 'nonce-123'",
			CSPStyleSrc:   "'self' 'unsafe-inline' fonts.googleapis.com",
			CSPImgSrc:     "'self' data: https: cdn.example.com",
		},
	}

	router := gin.New()
	router.Use(SecurityMiddleware(cfg))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	req := httptest.NewRequest("GET", "/test", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	csp := resp.Header().Get("Content-Security-Policy")

	expectedDirectives := []string{
		"default-src 'self' example.com",
		"script-src 'self' 'nonce-123'",
		"style-src 'self' 'unsafe-inline' fonts.googleapis.com",
		"img-src 'self' data: https: cdn.example.com",
	}

	for _, directive := range expectedDirectives {
		if !strings.Contains(csp, directive) {
			t.Errorf("CSP missing expected custom directive: %s. Full CSP: %s", directive, csp)
		}
	}
}

func TestSecurityHeaders_PermissionsPolicy(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		SecurityHeaders: config.SecurityHeadersConfig{
			PermissionsPolicy: "geolocation=(), microphone=(), camera=()",
		},
	}

	router := gin.New()
	router.Use(SecurityMiddleware(cfg))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	req := httptest.NewRequest("GET", "/test", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	permissionsPolicy := resp.Header().Get("Permissions-Policy")
	expected := "geolocation=(), microphone=(), camera=()"
	if permissionsPolicy != expected {
		t.Errorf("Expected Permissions-Policy: %s, got: %s", expected, permissionsPolicy)
	}
}

func TestBuildCSP_AllDirectives(t *testing.T) {
	cfg := &config.Config{
		SecurityHeaders: config.SecurityHeadersConfig{
			CSPDefaultSrc: "'self'",
			CSPScriptSrc:  "'self' 'unsafe-eval'",
			CSPStyleSrc:   "'self' 'unsafe-inline'",
			CSPImgSrc:     "'self' data:",
			CSPFontSrc:    "'self'",
			CSPConnectSrc: "'self' api.example.com",
			CSPFrameSrc:   "'none'",
			CSPFormAction: "'self'",
		},
	}

	sh := NewSecurityHeaders(cfg)
	csp := sh.buildCSP()

	// Check that all directives are included
	expectedParts := []string{
		"default-src 'self'",
		"script-src 'self' 'unsafe-eval'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data:",
		"font-src 'self'",
		"connect-src 'self' api.example.com",
		"frame-src 'none'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	}

	for _, part := range expectedParts {
		if !strings.Contains(csp, part) {
			t.Errorf("CSP missing expected part: %s. Full CSP: %s", part, csp)
		}
	}

	// Verify CSP is properly formatted (semicolon-separated)
	parts := strings.Split(csp, "; ")
	if len(parts) != len(expectedParts) {
		t.Errorf("Expected %d CSP directives, got %d", len(expectedParts), len(parts))
	}
}

func BenchmarkSecurityMiddleware(b *testing.B) {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		SecurityHeaders: config.SecurityHeadersConfig{
			CSPEnabled:          true,
			XFrameOptions:       "DENY",
			XContentTypeOptions: true,
			XXSSProtection:      true,
			ReferrerPolicy:      "strict-origin-when-cross-origin",
			CSPDefaultSrc:       "'self'",
			CSPScriptSrc:        "'self'",
			CSPStyleSrc:         "'self' 'unsafe-inline'",
		},
	}

	router := gin.New()
	router.Use(SecurityMiddleware(cfg))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	req := httptest.NewRequest("GET", "/test", nil)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp := httptest.NewRecorder()
		router.ServeHTTP(resp, req)
	}
}

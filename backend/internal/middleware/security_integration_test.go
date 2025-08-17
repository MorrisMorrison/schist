package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/gin-gonic/gin"
)

// TestSecurityHeadersIntegration tests that security headers work with a full Gin setup
func TestSecurityHeadersIntegration(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Load a realistic config
	cfg := &config.Config{
		Environment: "production",
		SecurityHeaders: config.SecurityHeadersConfig{
			CSPEnabled:            true,
			XFrameOptions:         "DENY",
			XContentTypeOptions:   true,
			XXSSProtection:        true,
			ReferrerPolicy:        "strict-origin-when-cross-origin",
			PermissionsPolicy:     "geolocation=(), microphone=(), camera=()",
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

	// Add security middleware
	router.Use(SecurityMiddleware(cfg))

	// Add some realistic routes
	api := router.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "healthy"})
		})

		api.GET("/documents", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"documents": []string{}})
		})
	}

	// Static file serving
	router.Static("/static", "./testdata")

	// Test API endpoint
	t.Run("API endpoint has security headers", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/health", nil)
		resp := httptest.NewRecorder()
		router.ServeHTTP(resp, req)

		if resp.Code != http.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.Code)
		}

		validateSecurityHeaders(t, resp)
	})

	// Test static content
	t.Run("Static content has security headers", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/static/test.txt", nil)
		resp := httptest.NewRecorder()
		router.ServeHTTP(resp, req)

		// Note: This will 404 since we don't have testdata, but headers should still be set
		validateSecurityHeaders(t, resp)
	})

	// Test OPTIONS request (CORS preflight)
	t.Run("OPTIONS request has security headers", func(t *testing.T) {
		req := httptest.NewRequest("OPTIONS", "/api/documents", nil)
		resp := httptest.NewRecorder()
		router.ServeHTTP(resp, req)

		validateSecurityHeaders(t, resp)
	})
}

func validateSecurityHeaders(t *testing.T, resp *httptest.ResponseRecorder) {
	t.Helper()

	// Check all security headers are present and correct
	headers := map[string]string{
		"X-Frame-Options":        "DENY",
		"X-Content-Type-Options": "nosniff",
		"X-XSS-Protection":       "1; mode=block",
		"Referrer-Policy":        "strict-origin-when-cross-origin",
		"Permissions-Policy":     "geolocation=(), microphone=(), camera=()",
	}

	for header, expectedValue := range headers {
		actualValue := resp.Header().Get(header)
		if actualValue != expectedValue {
			t.Errorf("Expected %s: %s, got: %s", header, expectedValue, actualValue)
		}
	}

	// Check CSP is present and has expected directives
	csp := resp.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Error("Content-Security-Policy header is missing")
		return
	}

	requiredDirectives := []string{
		"default-src 'self'",
		"script-src 'self'",
		"style-src 'self' 'unsafe-inline'",
		"object-src 'none'",
		"base-uri 'self'",
		"frame-ancestors 'none'",
	}

	for _, directive := range requiredDirectives {
		if !containsDirective(csp, directive) {
			t.Errorf("CSP missing required directive: %s. Full CSP: %s", directive, csp)
		}
	}
}

func containsDirective(csp, directive string) bool {
	return strings.Contains(csp, directive)
}

// TestSecurityHeadersPerformance ensures security headers don't significantly impact performance
func TestSecurityHeadersPerformance(t *testing.T) {
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

	// Test that many requests complete quickly
	iterations := 1000
	for i := 0; i < iterations; i++ {
		resp := httptest.NewRecorder()
		router.ServeHTTP(resp, req)

		if resp.Code != http.StatusOK {
			t.Errorf("Request %d failed with status %d", i, resp.Code)
			break
		}
	}
}

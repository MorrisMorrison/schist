package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/gin-gonic/gin"
)

// TestSecurityHeadersManualVerification provides a comprehensive dump of all security headers
// for manual verification. This test can be run with `go test -v -run ManualVerification`
func TestSecurityHeadersManualVerification(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Use production-like configuration
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
	router.Use(SecurityMiddleware(cfg))
	router.GET("/", func(c *gin.Context) {
		c.String(http.StatusOK, "Security Headers Test Page")
	})

	req := httptest.NewRequest("GET", "/", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	fmt.Println("=== SECURITY HEADERS VERIFICATION ===")
	fmt.Printf("Status Code: %d\n", resp.Code)
	fmt.Println("\n--- Security Headers ---")

	securityHeaders := []string{
		"Content-Security-Policy",
		"X-Frame-Options",
		"X-Content-Type-Options",
		"X-XSS-Protection",
		"Referrer-Policy",
		"Permissions-Policy",
		"Strict-Transport-Security",
	}

	for _, header := range securityHeaders {
		value := resp.Header().Get(header)
		if value != "" {
			fmt.Printf("✓ %s: %s\n", header, value)
		} else {
			fmt.Printf("✗ %s: NOT SET\n", header)
		}
	}

	fmt.Println("\n--- All Response Headers ---")
	for name, values := range resp.Header() {
		for _, value := range values {
			fmt.Printf("%s: %s\n", name, value)
		}
	}

	// Validate critical security headers exist
	criticalHeaders := map[string]string{
		"Content-Security-Policy": "default-src 'self'",
		"X-Frame-Options":         "DENY",
		"X-Content-Type-Options":  "nosniff",
	}

	fmt.Println("\n--- Security Validation ---")
	allPresent := true
	for header, expectedPart := range criticalHeaders {
		value := resp.Header().Get(header)
		if value == "" {
			fmt.Printf("❌ CRITICAL: %s is missing\n", header)
			allPresent = false
		} else if expectedPart != "" && len(value) > 0 {
			fmt.Printf("✅ %s is present\n", header)
		}
	}

	if allPresent {
		fmt.Println("\n🔒 ALL CRITICAL SECURITY HEADERS ARE PRESENT")
	} else {
		fmt.Println("\n⚠️  SOME CRITICAL SECURITY HEADERS ARE MISSING")
		t.Error("Critical security headers are missing")
	}

	fmt.Println("\n=== END VERIFICATION ===")
}

// TestCSPDirectivesBreakdown provides a detailed breakdown of CSP directives
func TestCSPDirectivesBreakdown(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		SecurityHeaders: config.SecurityHeadersConfig{
			CSPEnabled:    true,
			CSPDefaultSrc: "'self'",
			CSPScriptSrc:  "'self'",
			CSPStyleSrc:   "'self' 'unsafe-inline'",
			CSPImgSrc:     "'self' data: https:",
			CSPFontSrc:    "'self' data:",
			CSPConnectSrc: "'self'",
			CSPFrameSrc:   "'none'",
			CSPFormAction: "'self'",
		},
	}

	sh := NewSecurityHeaders(cfg)
	csp := sh.buildCSP()

	fmt.Println("\n=== CONTENT SECURITY POLICY BREAKDOWN ===")
	fmt.Printf("Full CSP: %s\n\n", csp)

	// Parse and display individual directives
	directives := map[string]string{
		"default-src":     "Fallback for other resource types",
		"script-src":      "JavaScript execution",
		"style-src":       "CSS stylesheets (includes 'unsafe-inline' for Svelte)",
		"img-src":         "Images (allows data: URIs and HTTPS)",
		"font-src":        "Fonts (allows data: URIs)",
		"connect-src":     "AJAX, WebSocket, EventSource",
		"frame-src":       "Frames and iframes ('none' blocks all)",
		"object-src":      "Plugins like Flash ('none' blocks all)",
		"base-uri":        "Base tag restrictions",
		"form-action":     "Form submission targets",
		"frame-ancestors": "Who can embed this page ('none' prevents embedding)",
	}

	fmt.Println("--- CSP Directive Explanations ---")
	for directive, explanation := range directives {
		fmt.Printf("• %-15s: %s\n", directive, explanation)
	}

	fmt.Println("\n--- Svelte Compatibility Notes ---")
	fmt.Println("• style-src includes 'unsafe-inline' - Required for Svelte's dynamic styles")
	fmt.Println("• img-src allows data: URIs - Common for inline images")
	fmt.Println("• font-src allows data: URIs - Common for embedded fonts")
	fmt.Println("• script-src only allows 'self' - Blocks inline scripts and external scripts")

	fmt.Println("\n=== END CSP BREAKDOWN ===")
}

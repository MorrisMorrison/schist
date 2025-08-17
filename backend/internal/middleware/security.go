package middleware

import (
	"fmt"
	"strings"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/gin-gonic/gin"
)

type SecurityHeaders struct {
	config *config.Config
}

func NewSecurityHeaders(config *config.Config) *SecurityHeaders {
	return &SecurityHeaders{
		config: config,
	}
}

func (sh *SecurityHeaders) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Content Security Policy
		if sh.config.SecurityHeaders.CSPEnabled {
			csp := sh.buildCSP()
			c.Header("Content-Security-Policy", csp)
		}

		// X-Frame-Options - Prevent clickjacking
		if sh.config.SecurityHeaders.XFrameOptions != "" {
			c.Header("X-Frame-Options", sh.config.SecurityHeaders.XFrameOptions)
		}

		// X-Content-Type-Options - Prevent MIME type sniffing
		if sh.config.SecurityHeaders.XContentTypeOptions {
			c.Header("X-Content-Type-Options", "nosniff")
		}

		// HTTP Strict Transport Security (HSTS) - Only for HTTPS in production
		if sh.config.SecurityHeaders.HSTSEnabled && !sh.config.IsDevelopment() && c.Request.TLS != nil {
			hstsHeader := fmt.Sprintf("max-age=%d", sh.config.SecurityHeaders.HSTSMaxAge)
			if sh.config.SecurityHeaders.HSTSIncludeSubdomains {
				hstsHeader += "; includeSubDomains"
			}
			if sh.config.SecurityHeaders.HSTSPreload {
				hstsHeader += "; preload"
			}
			c.Header("Strict-Transport-Security", hstsHeader)
		}

		// X-XSS-Protection - Legacy browser protection
		if sh.config.SecurityHeaders.XXSSProtection {
			c.Header("X-XSS-Protection", "1; mode=block")
		}

		// Referrer Policy - Control referrer information
		if sh.config.SecurityHeaders.ReferrerPolicy != "" {
			c.Header("Referrer-Policy", sh.config.SecurityHeaders.ReferrerPolicy)
		}

		// Permissions Policy - Control browser features
		if sh.config.SecurityHeaders.PermissionsPolicy != "" {
			c.Header("Permissions-Policy", sh.config.SecurityHeaders.PermissionsPolicy)
		}

		c.Next()
	}
}

func (sh *SecurityHeaders) buildCSP() string {
	directives := []string{}

	// Default policy - everything from same origin
	if sh.config.SecurityHeaders.CSPDefaultSrc != "" {
		directives = append(directives, fmt.Sprintf("default-src %s", sh.config.SecurityHeaders.CSPDefaultSrc))
	}

	// Script sources - Svelte requires self
	if sh.config.SecurityHeaders.CSPScriptSrc != "" {
		directives = append(directives, fmt.Sprintf("script-src %s", sh.config.SecurityHeaders.CSPScriptSrc))
	}

	// Style sources - Svelte uses inline styles
	if sh.config.SecurityHeaders.CSPStyleSrc != "" {
		directives = append(directives, fmt.Sprintf("style-src %s", sh.config.SecurityHeaders.CSPStyleSrc))
	}

	// Image sources - Allow data URIs for inline images
	if sh.config.SecurityHeaders.CSPImgSrc != "" {
		directives = append(directives, fmt.Sprintf("img-src %s", sh.config.SecurityHeaders.CSPImgSrc))
	}

	// Font sources
	if sh.config.SecurityHeaders.CSPFontSrc != "" {
		directives = append(directives, fmt.Sprintf("font-src %s", sh.config.SecurityHeaders.CSPFontSrc))
	}

	// Connect sources - API calls
	if sh.config.SecurityHeaders.CSPConnectSrc != "" {
		directives = append(directives, fmt.Sprintf("connect-src %s", sh.config.SecurityHeaders.CSPConnectSrc))
	}

	// Frame sources - External content embedding
	if sh.config.SecurityHeaders.CSPFrameSrc != "" {
		directives = append(directives, fmt.Sprintf("frame-src %s", sh.config.SecurityHeaders.CSPFrameSrc))
	}

	// Object sources - Plugins (block by default)
	directives = append(directives, "object-src 'none'")

	// Base URI - Prevent base tag injection
	directives = append(directives, "base-uri 'self'")

	// Form actions - Where forms can submit
	if sh.config.SecurityHeaders.CSPFormAction != "" {
		directives = append(directives, fmt.Sprintf("form-action %s", sh.config.SecurityHeaders.CSPFormAction))
	}

	// Frame ancestors - Who can embed this page
	directives = append(directives, "frame-ancestors 'none'")

	return strings.Join(directives, "; ")
}

func SecurityMiddleware(config *config.Config) gin.HandlerFunc {
	security := NewSecurityHeaders(config)
	return security.Middleware()
}

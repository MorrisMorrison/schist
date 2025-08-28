package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

type RateLimiter struct {
	limiters map[string]*rate.Limiter
	mu       sync.RWMutex
	rps      rate.Limit
	burst    int
}

func NewRateLimiter(rpm int) *RateLimiter {
	rps := rate.Limit(float64(rpm) / 60.0)
	return &RateLimiter{
		limiters: make(map[string]*rate.Limiter),
		rps:      rps,
		burst:    rpm,
	}
}

func (rl *RateLimiter) GetLimiter(ip string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	limiter, exists := rl.limiters[ip]
	if !exists {
		limiter = rate.NewLimiter(rl.rps, rl.burst)
		rl.limiters[ip] = limiter
	}

	return limiter
}

func (rl *RateLimiter) CleanupOldLimiters() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	for ip, limiter := range rl.limiters {
		if limiter.Tokens() == float64(rl.burst) {
			delete(rl.limiters, ip)
		}
	}
}

func RateLimitMiddleware(rpm int) gin.HandlerFunc {
	return TieredRateLimitMiddleware(rpm, rpm, rpm, rpm)
}

func TieredRateLimitMiddleware(defaultRPM, shareRPM, assetRPM, publicRPM int) gin.HandlerFunc {
	defaultLimiter := NewRateLimiter(defaultRPM)
	shareLimiter := NewRateLimiter(shareRPM)
	assetLimiter := NewRateLimiter(assetRPM)
	publicLimiter := NewRateLimiter(publicRPM)

	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			defaultLimiter.CleanupOldLimiters()
			shareLimiter.CleanupOldLimiters()
			assetLimiter.CleanupOldLimiters()
			publicLimiter.CleanupOldLimiters()
		}
	}()

	return func(c *gin.Context) {
		ip := c.ClientIP()
		path := c.Request.URL.Path

		var limiter *rate.Limiter
		var rpm int
		var category string

		switch {
		case strings.HasPrefix(path, "/api/shares/"):
			limiter = shareLimiter.GetLimiter(ip)
			rpm = shareRPM
			category = "share"
		case strings.HasPrefix(path, "/uploads/") ||
			strings.HasPrefix(path, "/_app/") ||
			strings.HasPrefix(path, "/assets/") ||
			isStaticAsset(path):
			limiter = assetLimiter.GetLimiter(ip)
			rpm = assetRPM
			category = "asset"
		case IsPublicEndpoint(path):
			limiter = publicLimiter.GetLimiter(ip)
			rpm = publicRPM
			category = "public"
		default:
			limiter = defaultLimiter.GetLimiter(ip)
			rpm = defaultRPM
			category = "default"
		}

		if !limiter.Allow() {
			retryAfter := 60

			c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rpm))
			c.Header("X-RateLimit-Remaining", "0")
			c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(time.Minute).Unix()))
			c.Header("X-RateLimit-Category", category)
			c.Header("Retry-After", fmt.Sprintf("%d", retryAfter))

			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":      "Rate limit exceeded",
				"message":    fmt.Sprintf("Too many %s requests. Please try again later.", category),
				"category":   category,
				"retryAfter": retryAfter,
			})
			c.Abort()
			return
		}

		remaining := int(limiter.Tokens())
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rpm))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(time.Minute).Unix()))
		c.Header("X-RateLimit-Category", category)

		c.Next()
	}
}

// isStaticAsset checks if the path is a static asset (images, fonts, etc.)
func isStaticAsset(path string) bool {
	// Common static file extensions
	staticExtensions := []string{
		".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
		".ico", ".woff", ".woff2", ".ttf", ".otf", ".eot",
		".css", ".js", ".map", ".json", ".xml", ".txt",
	}

	for _, ext := range staticExtensions {
		if strings.HasSuffix(strings.ToLower(path), ext) {
			return true
		}
	}

	return false
}

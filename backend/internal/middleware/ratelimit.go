package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// RateLimiter stores rate limiters for different IP addresses
type RateLimiter struct {
	limiters map[string]*rate.Limiter
	mu       sync.RWMutex
	rps      rate.Limit
	burst    int
}

// NewRateLimiter creates a new rate limiter with the specified requests per minute
func NewRateLimiter(rpm int) *RateLimiter {
	// Convert requests per minute to requests per second
	rps := rate.Limit(float64(rpm) / 60.0)
	return &RateLimiter{
		limiters: make(map[string]*rate.Limiter),
		rps:      rps,
		burst:    rpm, // Allow burst up to the per-minute limit
	}
}

// GetLimiter returns a rate limiter for the given IP address
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

// CleanupOldLimiters removes limiters that haven't been used recently
func (rl *RateLimiter) CleanupOldLimiters() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	for ip, limiter := range rl.limiters {
		// Remove limiters that allow full burst (haven't been used recently)
		if limiter.Tokens() == float64(rl.burst) {
			delete(rl.limiters, ip)
		}
	}
}

// RateLimitMiddleware returns a Gin middleware that implements rate limiting
func RateLimitMiddleware(rpm int) gin.HandlerFunc {
	rateLimiter := NewRateLimiter(rpm)

	// Start cleanup routine
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			rateLimiter.CleanupOldLimiters()
		}
	}()

	return func(c *gin.Context) {
		ip := c.ClientIP()
		limiter := rateLimiter.GetLimiter(ip)

		if !limiter.Allow() {
			// Simple retry after calculation - 60 seconds
			retryAfter := 60

			c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rpm))
			c.Header("X-RateLimit-Remaining", "0")
			c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(time.Minute).Unix()))
			c.Header("Retry-After", fmt.Sprintf("%d", retryAfter))

			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":      "Rate limit exceeded",
				"message":    "Too many requests. Please try again later.",
				"retryAfter": retryAfter,
			})
			c.Abort()
			return
		}

		// Add rate limit headers for successful requests
		remaining := int(limiter.Tokens())
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rpm))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(time.Minute).Unix()))

		c.Next()
	}
}

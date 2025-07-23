package middleware

import (
	"fmt"
	"net/http"
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
	rateLimiter := NewRateLimiter(rpm)

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

		remaining := int(limiter.Tokens())
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rpm))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(time.Minute).Unix()))

		c.Next()
	}
}

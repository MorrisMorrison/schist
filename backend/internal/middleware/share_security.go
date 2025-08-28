package middleware

import (
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type ShareSecurityTracker struct {
	failedAttempts map[string]int
	lastAttempt    map[string]time.Time
	mu             sync.RWMutex
}

func NewShareSecurityTracker() *ShareSecurityTracker {
	tracker := &ShareSecurityTracker{
		failedAttempts: make(map[string]int),
		lastAttempt:    make(map[string]time.Time),
	}

	go tracker.cleanupOldEntries()
	return tracker
}

func (st *ShareSecurityTracker) cleanupOldEntries() {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		st.mu.Lock()
		now := time.Now()
		for ip, lastTime := range st.lastAttempt {
			if now.Sub(lastTime) > time.Hour {
				delete(st.failedAttempts, ip)
				delete(st.lastAttempt, ip)
			}
		}
		st.mu.Unlock()
	}
}

func (st *ShareSecurityTracker) recordFailedAttempt(ip string) int {
	st.mu.Lock()
	defer st.mu.Unlock()

	st.failedAttempts[ip]++
	st.lastAttempt[ip] = time.Now()
	return st.failedAttempts[ip]
}

func (st *ShareSecurityTracker) getFailedAttempts(ip string) int {
	st.mu.RLock()
	defer st.mu.RUnlock()
	return st.failedAttempts[ip]
}

func (st *ShareSecurityTracker) shouldDelay(ip string) (bool, time.Duration) {
	attempts := st.getFailedAttempts(ip)
	if attempts == 0 {
		return false, 0
	}

	var delay time.Duration
	switch {
	case attempts >= 10:
		delay = 60 * time.Second
	case attempts >= 5:
		delay = 30 * time.Second
	case attempts >= 3:
		delay = 10 * time.Second
	case attempts >= 1:
		delay = 2 * time.Second
	default:
		return false, 0
	}

	return true, delay
}

func (st *ShareSecurityTracker) clearFailedAttempts(ip string) {
	st.mu.Lock()
	defer st.mu.Unlock()
	delete(st.failedAttempts, ip)
	delete(st.lastAttempt, ip)
}

var shareTracker = NewShareSecurityTracker()

func ShareSecurityMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.URL.Path, "/api/shares/") || c.Request.Method != "GET" {
			c.Next()
			return
		}

		ip := c.ClientIP()

		if shouldDelay, delay := shareTracker.shouldDelay(ip); shouldDelay {
			log.Printf("SECURITY: Share access delayed for IP %s (%d failed attempts) - delay: %v",
				ip, shareTracker.getFailedAttempts(ip), delay)

			time.Sleep(delay)

			if shareTracker.getFailedAttempts(ip) >= 10 {
				log.Printf("SECURITY: Share access blocked for IP %s (too many failed attempts)", ip)
				c.JSON(http.StatusTooManyRequests, gin.H{
					"error":   "Too many failed attempts",
					"message": "Access temporarily blocked due to suspicious activity",
				})
				c.Abort()
				return
			}
		}

		c.Next()

		if c.Writer.Status() == http.StatusNotFound {
			attempts := shareTracker.recordFailedAttempt(ip)
			log.Printf("SECURITY: Failed share access attempt from IP %s (attempt %d) - path: %s",
				ip, attempts, c.Request.URL.Path)
		} else if c.Writer.Status() == http.StatusOK {
			shareTracker.clearFailedAttempts(ip)
			log.Printf("SECURITY: Successful share access from IP %s - path: %s",
				ip, c.Request.URL.Path)
		}
	}
}

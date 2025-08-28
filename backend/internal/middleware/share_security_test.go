package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestShareSecurityMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("should not affect non-share endpoints", func(t *testing.T) {
		router := gin.New()
		router.Use(ShareSecurityMiddleware())

		router.GET("/api/documents", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "success"})
		})

		req := httptest.NewRequest("GET", "/api/documents", nil)
		req.RemoteAddr = "192.168.1.1:12345"

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("should allow successful share access", func(t *testing.T) {
		router := gin.New()
		router.Use(ShareSecurityMiddleware())

		router.GET("/api/shares/:token", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "success"})
		})

		req := httptest.NewRequest("GET", "/api/shares/valid-token", nil)
		req.RemoteAddr = "192.168.1.2:12345"

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("should track failed attempts", func(t *testing.T) {
		router := gin.New()
		router.Use(ShareSecurityMiddleware())

		router.GET("/api/shares/:token", func(c *gin.Context) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		})

		// First failed attempt
		req := httptest.NewRequest("GET", "/api/shares/invalid-token", nil)
		req.RemoteAddr = "192.168.1.3:12345"

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})
}

func TestShareSecurityTracker(t *testing.T) {
	tracker := NewShareSecurityTracker()

	t.Run("should start with zero failed attempts", func(t *testing.T) {
		attempts := tracker.getFailedAttempts("192.168.1.1")
		assert.Equal(t, 0, attempts)
	})

	t.Run("should record failed attempts", func(t *testing.T) {
		ip := "192.168.1.1"

		attempts := tracker.recordFailedAttempt(ip)
		assert.Equal(t, 1, attempts)

		attempts = tracker.recordFailedAttempt(ip)
		assert.Equal(t, 2, attempts)

		storedAttempts := tracker.getFailedAttempts(ip)
		assert.Equal(t, 2, storedAttempts)
	})

	t.Run("should calculate delays correctly", func(t *testing.T) {
		ip := "192.168.1.2"

		shouldDelay, delay := tracker.shouldDelay(ip)
		assert.False(t, shouldDelay)
		assert.Equal(t, time.Duration(0), delay)

		tracker.recordFailedAttempt(ip)
		shouldDelay, delay = tracker.shouldDelay(ip)
		assert.True(t, shouldDelay)
		assert.Equal(t, 2*time.Second, delay)

		tracker.recordFailedAttempt(ip)
		tracker.recordFailedAttempt(ip)
		shouldDelay, delay = tracker.shouldDelay(ip)
		assert.True(t, shouldDelay)
		assert.Equal(t, 10*time.Second, delay)

		for i := 0; i < 2; i++ {
			tracker.recordFailedAttempt(ip)
		}
		shouldDelay, delay = tracker.shouldDelay(ip)
		assert.True(t, shouldDelay)
		assert.Equal(t, 30*time.Second, delay)

		for i := 0; i < 5; i++ {
			tracker.recordFailedAttempt(ip)
		}
		shouldDelay, delay = tracker.shouldDelay(ip)
		assert.True(t, shouldDelay)
		assert.Equal(t, 60*time.Second, delay)
	})

	t.Run("should clear failed attempts", func(t *testing.T) {
		ip := "192.168.1.3"

		tracker.recordFailedAttempt(ip)
		tracker.recordFailedAttempt(ip)
		assert.Equal(t, 2, tracker.getFailedAttempts(ip))

		tracker.clearFailedAttempts(ip)
		assert.Equal(t, 0, tracker.getFailedAttempts(ip))
	})
}

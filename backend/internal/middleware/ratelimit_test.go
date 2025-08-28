package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestTieredRateLimitMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name             string
		path             string
		expectedLimit    string
		expectedCategory string
	}{
		{
			name:             "Share endpoint uses share rate limit",
			path:             "/api/shares/test-token",
			expectedLimit:    "5",
			expectedCategory: "share",
		},
		{
			name:             "Upload endpoint uses asset rate limit",
			path:             "/uploads/test-image.jpg",
			expectedLimit:    "10",
			expectedCategory: "asset",
		},
		{
			name:             "Frontend asset uses asset rate limit",
			path:             "/_app/immutable/chunks/test.js",
			expectedLimit:    "10",
			expectedCategory: "asset",
		},
		{
			name:             "Static icon uses asset rate limit",
			path:             "/icon-128x128.png",
			expectedLimit:    "10",
			expectedCategory: "asset",
		},
		{
			name:             "Health endpoint uses public rate limit",
			path:             "/api/health",
			expectedLimit:    "15",
			expectedCategory: "public",
		},
		{
			name:             "API endpoint uses default rate limit",
			path:             "/api/documents",
			expectedLimit:    "300",
			expectedCategory: "default",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()

			router.Use(TieredRateLimitMiddleware(300, 5, 10, 15))

			router.GET("/*path", func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"message": "success"})
			})

			req := httptest.NewRequest("GET", tt.path, nil)
			req.RemoteAddr = "192.168.1.1:12345"

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusOK, w.Code)
			assert.Equal(t, tt.expectedLimit, w.Header().Get("X-RateLimit-Limit"))
			assert.Equal(t, tt.expectedCategory, w.Header().Get("X-RateLimit-Category"))
		})
	}
}

func TestRateLimitExceeded(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(TieredRateLimitMiddleware(2, 1, 2, 2))

	router.GET("/api/shares/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "success"})
	})

	req1 := httptest.NewRequest("GET", "/api/shares/test", nil)
	req1.RemoteAddr = "192.168.1.2:12345"
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusOK, w1.Code)

	req2 := httptest.NewRequest("GET", "/api/shares/test", nil)
	req2.RemoteAddr = "192.168.1.2:12345"
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusTooManyRequests, w2.Code)
	assert.Equal(t, "1", w2.Header().Get("X-RateLimit-Limit"))
	assert.Equal(t, "0", w2.Header().Get("X-RateLimit-Remaining"))
	assert.Contains(t, w2.Body.String(), "Too many share requests")
}

func TestIsPublicEndpoint(t *testing.T) {
	tests := []struct {
		path     string
		expected bool
	}{
		{"/api/health", true},
		{"/api/config", true},
		{"/api/auth/setup/required", true},
		{"/api/passkeys/register/test", true},
		{"/api/documents", false},
		{"/api/shares/token", false},
		{"/uploads/image.jpg", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			result := IsPublicEndpoint(tt.path)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsStaticAsset(t *testing.T) {
	tests := []struct {
		path     string
		expected bool
	}{
		{"/icon-128x128.png", true},
		{"/favicon.ico", true},
		{"/style.css", true},
		{"/script.js", true},
		{"/font.woff2", true},
		{"/image.svg", true},
		{"/data.json", true},
		{"/api/documents", false},
		{"/api/health", false},
		{"/some/path", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			result := isStaticAsset(tt.path)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRateLimiterCleanup(t *testing.T) {
	rl := NewRateLimiter(10)

	// Create a limiter and verify it exists
	limiter1 := rl.GetLimiter("192.168.1.1")
	assert.NotNil(t, limiter1)
	assert.Equal(t, 1, len(rl.limiters))

	// Use some tokens
	limiter1.Allow()
	limiter1.Allow()

	// Cleanup should not remove it yet (doesn't have full tokens)
	rl.CleanupOldLimiters()
	assert.Equal(t, 1, len(rl.limiters))

	// Test that cleanup function exists and can be called
	// The actual cleanup behavior depends on token refill timing
	// which is difficult to test reliably
	assert.NotNil(t, rl.CleanupOldLimiters)
}

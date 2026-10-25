package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/services"
)

func TestRequireAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	users := services.NewUserService(t.TempDir())
	require.NoError(t, users.CreateFirstUser("alice", "cred-a"))
	require.NoError(t, users.CreateUser("bob", false, "cred-b"))

	tests := []struct {
		name   string
		user   any // value stored under authenticated_user; nil = not set
		status int
		msg    string
	}{
		{"admin", "alice", http.StatusOK, ""},
		{"non-admin", "bob", http.StatusForbidden, "Administrator privileges required to access this resource"},
		{"unknown user", "ghost", http.StatusForbidden, "Administrator privileges required to access this resource"},
		{"no user", nil, http.StatusForbidden, "Authentication required to access this resource"},
		{"empty username", "", http.StatusForbidden, "Authentication required to access this resource"},
		{"wrong type", 42, http.StatusForbidden, "Authentication required to access this resource"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()
			router.Use(func(c *gin.Context) {
				if tt.user != nil {
					c.Set("authenticated_user", tt.user)
				}
				c.Next()
			})
			reached := false
			router.GET("/admin", RequireAdmin(users), func(c *gin.Context) {
				reached = true
				c.Status(http.StatusOK)
			})

			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/admin", nil))
			require.Equal(t, tt.status, w.Code)
			assert.Equal(t, tt.status == http.StatusOK, reached, "handler must only run for admins")
			if tt.msg != "" {
				var body map[string]string
				require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
				assert.Equal(t, "Forbidden", body["error"])
				assert.Equal(t, tt.msg, body["message"])
			}
		})
	}
}

func rateLimitedRouter(rpm int) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RateLimitMiddleware(rpm))
	router.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })
	return router
}

func getFrom(router http.Handler, ip string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = ip + ":1234"
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestRateLimitMiddleware(t *testing.T) {
	router := rateLimitedRouter(3)

	for i := 0; i < 3; i++ {
		w := getFrom(router, "203.0.113.1")
		require.Equal(t, http.StatusOK, w.Code, "request %d", i)
		assert.Equal(t, "3", w.Header().Get("X-RateLimit-Limit"))
		remaining, err := strconv.Atoi(w.Header().Get("X-RateLimit-Remaining"))
		require.NoError(t, err)
		assert.Equal(t, 2-i, remaining)
		assert.NotEmpty(t, w.Header().Get("X-RateLimit-Reset"))
	}

	w := getFrom(router, "203.0.113.1")
	require.Equal(t, http.StatusTooManyRequests, w.Code)
	assert.Equal(t, "0", w.Header().Get("X-RateLimit-Remaining"))
	assert.Equal(t, "60", w.Header().Get("Retry-After"))
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "Rate limit exceeded", body["error"])
	assert.EqualValues(t, 60, body["retryAfter"])

	// Limits are per client IP.
	assert.Equal(t, http.StatusOK, getFrom(router, "203.0.113.2").Code)
}

func TestRateLimiter_LimiterPerIPAndCleanup(t *testing.T) {
	rl := NewRateLimiter(60)
	a := rl.GetLimiter("198.51.100.1")
	assert.Same(t, a, rl.GetLimiter("198.51.100.1"), "the same IP reuses its limiter")
	assert.NotSame(t, a, rl.GetLimiter("198.51.100.2"))

	// A limiter that has been used keeps its state; an idle (full) one is
	// dropped.
	require.True(t, a.AllowN(time.Now(), 30))
	rl.CleanupOldLimiters()
	rl.mu.RLock()
	_, keptBusy := rl.limiters["198.51.100.1"]
	_, keptIdle := rl.limiters["198.51.100.2"]
	rl.mu.RUnlock()
	assert.True(t, keptBusy)
	assert.False(t, keptIdle)
}

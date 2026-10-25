package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/handlers"
	"github.com/MorrisMorrison/schist/internal/services"
)

func TestInitDataDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "data")
	initDataDir(&config.Config{DataDir: dir})
	assert.DirExists(t, dir)
}

func TestSetupCORS(t *testing.T) {
	gin.SetMode(gin.TestMode)
	preflight := func(router *gin.Engine) *httptest.ResponseRecorder {
		router.GET("/api/x", func(c *gin.Context) { c.Status(http.StatusOK) })
		req := httptest.NewRequest(http.MethodOptions, "/api/x", nil)
		req.Header.Set("Origin", "http://localhost:5173")
		req.Header.Set("Access-Control-Request-Method", "GET")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}

	dev := gin.New()
	setupCORS(dev, &config.Config{Environment: "development", FrontendURL: "http://localhost:5173"})
	w := preflight(dev)
	assert.Equal(t, "http://localhost:5173", w.Header().Get("Access-Control-Allow-Origin"))

	prod := gin.New()
	setupCORS(prod, &config.Config{Environment: "production", FrontendURL: "http://localhost:5173"})
	w = preflight(prod)
	assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"), "no CORS outside development")
}

// newServices builds the real container against a temp data dir.
func newServices(t *testing.T, env map[string]string) *services.Services {
	t.Helper()
	t.Setenv("ENV", "development")
	t.Setenv("SCHIST_DATA_DIR", t.TempDir())
	t.Setenv("SCHIST_JWT_SECRET", "main-test-secret-0123456789abcdefghij") // gitleaks:allow (test-only value)
	for k, v := range env {
		t.Setenv(k, v)
	}
	svc, err := services.NewServices()
	require.NoError(t, err)
	return svc
}

func TestSetupMiddleware_WiresSecurityRateLimitAndAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newServices(t, map[string]string{
		"SCHIST_AUTH_ENABLED":       "true",
		"SCHIST_RATE_LIMIT_ENABLED": "true",
		"SCHIST_RATE_LIMIT_RPM":     "2",
	})

	router := gin.New()
	setupMiddleware(router, svc)
	handlers.NewAPIHandler(svc).SetupAPIRoutes(router.Group("/api"))

	get := func(target string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, target, nil))
		return w
	}

	w := get("/api/health")
	require.Equal(t, http.StatusOK, w.Code)
	assert.NotEmpty(t, w.Header().Get("X-Content-Type-Options"), "security headers are installed")
	assert.Equal(t, "2", w.Header().Get("X-RateLimit-Limit"))

	assert.Equal(t, http.StatusUnauthorized, get("/api/documents").Code, "auth is enforced")
	assert.Equal(t, http.StatusTooManyRequests, get("/api/health").Code, "rate limiting is installed")
}

func TestSetupMiddleware_AuthAndRateLimitOff(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newServices(t, map[string]string{
		"SCHIST_AUTH_ENABLED":       "false",
		"SCHIST_RATE_LIMIT_ENABLED": "false",
	})

	router := gin.New()
	setupMiddleware(router, svc)
	handlers.NewAPIHandler(svc).SetupAPIRoutes(router.Group("/api"))

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/documents", nil))
	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Empty(t, w.Header().Get("X-RateLimit-Limit"))
}

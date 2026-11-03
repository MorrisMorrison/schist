package handlers

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStaticHandler_ServeStatic(t *testing.T) {
	gin.SetMode(gin.TestMode)
	root := t.TempDir()
	staticDir := filepath.Join(root, "web")
	require.NoError(t, os.MkdirAll(filepath.Join(staticDir, "docs"), 0755))
	write := func(p, content string) {
		require.NoError(t, os.WriteFile(p, []byte(content), 0644))
	}
	write(filepath.Join(staticDir, "index.html"), "INDEX")
	write(filepath.Join(staticDir, "app.js"), "APP")
	write(filepath.Join(staticDir, "secret.txt"), "PUBLIC COPY")
	write(filepath.Join(root, "secret.txt"), "OUTSIDE STATIC DIR")

	router := gin.New()
	NewStaticHandler(staticDir).SetupStaticRoutes(router)

	tests := []struct {
		name     string
		target   string
		wantCode int
		wantBody string
	}{
		{name: "existing file", target: "/app.js", wantCode: http.StatusOK, wantBody: "APP"},
		{name: "spa route falls back to index", target: "/documents/some/page", wantCode: http.StatusOK, wantBody: "INDEX"},
		{name: "directory falls back to index", target: "/docs", wantCode: http.StatusOK, wantBody: "INDEX"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, tt.target, nil))
			assert.Equal(t, tt.wantCode, w.Code)
			assert.Equal(t, tt.wantBody, w.Body.String())
		})
	}

	t.Run("dot-dot cannot leave the static dir", func(t *testing.T) {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/../secret.txt", nil))
		assert.NotContains(t, w.Body.String(), "OUTSIDE STATIC DIR")
	})
	// t.TempDir cleanup fails on Windows if a handler leaked an open file.
}

func TestStaticHandler_CacheHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	staticDir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(staticDir, "_app", "immutable", "chunks"), 0755))
	for p, content := range map[string]string{
		"index.html":                         "INDEX",
		"_app/version.json":                  `{"version":"1"}`,
		"_app/immutable/chunks/app.abc12.js": "CHUNK",
	} {
		require.NoError(t, os.WriteFile(filepath.Join(staticDir, filepath.FromSlash(p)), []byte(content), 0644))
	}
	router := gin.New()
	NewStaticHandler(staticDir).SetupStaticRoutes(router)

	get := func(target string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, target, nil))
		return w
	}

	w := get("/_app/immutable/chunks/app.abc12.js")
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "CHUNK", w.Body.String())
	assert.Equal(t, "public, max-age=31536000, immutable", w.Header().Get("Cache-Control"), "hashed build output is cached")

	w = get("/_app/version.json")
	require.Equal(t, http.StatusOK, w.Code)
	assert.Empty(t, w.Header().Get("Cache-Control"), "unhashed files are revalidated")

	w = get("/documents/some/page")
	assert.Equal(t, "INDEX", w.Body.String())
	assert.Equal(t, "no-cache", w.Header().Get("Cache-Control"), "the SPA shell is always revalidated")
}

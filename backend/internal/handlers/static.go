package handlers

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

type StaticHandler struct {
	staticDir string
}

func NewStaticHandler(staticDir string) *StaticHandler {
	return &StaticHandler{
		staticDir: staticDir,
	}
}

// ServeStatic serves static files and handles SPA routing
func (h *StaticHandler) ServeStatic() gin.HandlerFunc {
	return gin.HandlerFunc(func(c *gin.Context) {
		// Don't serve static files for API routes
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Next()
			return
		}

		// Try to serve the requested file
		filePath := filepath.Join(h.staticDir, c.Request.URL.Path)

		// Check if file exists
		if _, err := http.Dir(h.staticDir).Open(c.Request.URL.Path); err == nil {
			c.File(filePath)
			return
		}

		// If file doesn't exist, serve index.html for SPA routing
		indexPath := filepath.Join(h.staticDir, "index.html")
		c.File(indexPath)
	})
}

// SetupStaticRoutes configures static file serving
func (h *StaticHandler) SetupStaticRoutes(r *gin.Engine) {
	// Serve static assets (CSS, JS, images)
	r.Static("/assets", filepath.Join(h.staticDir, "assets"))
	r.Static("/_app", filepath.Join(h.staticDir, "_app"))

	// Handle all other routes (SPA fallback)
	r.NoRoute(h.ServeStatic())
}

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

func (h *StaticHandler) ServeStatic() gin.HandlerFunc {
	return gin.HandlerFunc(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Next()
			return
		}

		filePath := filepath.Join(h.staticDir, c.Request.URL.Path)

		if _, err := http.Dir(h.staticDir).Open(c.Request.URL.Path); err == nil {
			c.File(filePath)
			return
		}

		indexPath := filepath.Join(h.staticDir, "index.html")
		c.File(indexPath)
	})
}

func (h *StaticHandler) SetupStaticRoutes(router *gin.Engine) {
	router.Static("/assets", filepath.Join(h.staticDir, "assets"))
	router.Static("/_app", filepath.Join(h.staticDir, "_app"))

	router.NoRoute(h.ServeStatic())
}

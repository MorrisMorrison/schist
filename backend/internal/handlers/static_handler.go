package handlers

import (
	"net/http"
	"path"
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

		if filePath, ok := h.staticFile(c.Request.URL.Path); ok {
			c.File(filePath)
			return
		}

		indexPath := filepath.Join(h.staticDir, "index.html")
		c.File(indexPath)
	})
}

// staticFile resolves a request path to a regular file inside staticDir. The
// path is cleaned and rooted first, so it can never point outside staticDir;
// directories are not served (no listings), the SPA index is used instead.
func (h *StaticHandler) staticFile(requestPath string) (string, bool) {
	cleaned := path.Clean("/" + requestPath)

	f, err := http.Dir(h.staticDir).Open(cleaned)
	if err != nil {
		return "", false
	}
	info, err := f.Stat()
	f.Close() // the probe handle was previously leaked on every request
	if err != nil || info.IsDir() {
		return "", false
	}

	return filepath.Join(h.staticDir, filepath.FromSlash(cleaned)), true
}

func (h *StaticHandler) SetupStaticRoutes(router *gin.Engine) {
	router.Static("/assets", filepath.Join(h.staticDir, "assets"))
	router.Static("/_app", filepath.Join(h.staticDir, "_app"))

	router.NoRoute(h.ServeStatic())
}

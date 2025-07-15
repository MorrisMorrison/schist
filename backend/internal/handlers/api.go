package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type APIHandler struct {
}

func NewAPIHandler() *APIHandler {
	return &APIHandler{}
}

func (h *APIHandler) SetupAPIRoutes(r *gin.RouterGroup) {
	r.GET("/health", h.healthCheck)

	pages := r.Group("/pages")
	{
		pages.GET("", h.listPages)
		pages.GET("/:slug", h.getPage)
		pages.POST("", h.createPage)
		pages.PUT("/:slug", h.updatePage)
		pages.DELETE("/:slug", h.deletePage)
	}

	r.GET("/search", h.search)
}

func (h *APIHandler) healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "schist",
	})
}

func (h *APIHandler) listPages(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"pages": []gin.H{},
		"total": 0,
	})
}

func (h *APIHandler) getPage(c *gin.Context) {
	slug := c.Param("slug")
	c.JSON(http.StatusOK, gin.H{
		"slug":    slug,
		"title":   "Sample Page",
		"content": "# Sample Content\n\nThis is a placeholder page.",
	})
}

func (h *APIHandler) createPage(c *gin.Context) {
	c.JSON(http.StatusCreated, gin.H{
		"message": "Page created successfully",
	})
}

func (h *APIHandler) updatePage(c *gin.Context) {
	slug := c.Param("slug")
	c.JSON(http.StatusOK, gin.H{
		"message": "Page updated successfully",
		"slug":    slug,
	})
}

func (h *APIHandler) deletePage(c *gin.Context) {
	slug := c.Param("slug")
	c.JSON(http.StatusOK, gin.H{
		"message": "Page deleted successfully",
		"slug":    slug,
	})
}

func (h *APIHandler) search(c *gin.Context) {
	query := c.Query("q")
	c.JSON(http.StatusOK, gin.H{
		"query":   query,
		"results": []gin.H{},
		"total":   0,
	})
}

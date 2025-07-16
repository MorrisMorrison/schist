package handlers

import (
	"net/http"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-gonic/gin"
)

type APIHandler struct {
	PageService *services.PageService
}

func NewAPIHandler() *APIHandler {
	return &APIHandler{
		PageService: services.NewPageService(config.Load().DataDir),
	}
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
	pages, err := h.PageService.ListPages()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"pages": pages,
		"total": len(pages),
	})
}

func (h *APIHandler) getPage(c *gin.Context) {
	slug := c.Param("slug")
	page, err := h.PageService.ReadPage(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, page)
}

func (h *APIHandler) createPage(c *gin.Context) {
	page := &models.Page{}
	err := c.BindJSON(page)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
	}

	err = h.PageService.CreatePage(page)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Page created successfully",
	})
}

func (h *APIHandler) updatePage(c *gin.Context) {
	slug := c.Param("slug")
	page := &models.Page{}
	err := c.BindJSON(page)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
	}

	h.PageService.UpdatePage(page)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Page updated successfully",
		"slug":    slug,
	})
}

func (h *APIHandler) deletePage(c *gin.Context) {
	slug := c.Param("slug")
	err := h.PageService.DeletePage(slug)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err,
		})
	}

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

package handlers

import (
	"fmt"
	"net/http"

	"github.com/MorrisMorrison/schist/internal/utils"
	"github.com/gin-gonic/gin"
)

func (h *APIHandler) exportDocument(c *gin.Context) {
	path := utils.EnsureLeadingSlash(c.Param("path"))

	content, filename, err := h.DocumentService.ExportDocument(path)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Export failed: " + err.Error(),
		})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", "text/markdown; charset=utf-8")
	c.Header("Content-Length", fmt.Sprintf("%d", len(content)))

	c.Data(http.StatusOK, "text/markdown", content)
}

func (h *APIHandler) exportFolder(c *gin.Context) {
	path := utils.EnsureLeadingSlash(c.Param("path"))

	content, filename, err := h.DocumentService.ExportFolder(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Export failed: " + err.Error(),
		})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Length", fmt.Sprintf("%d", len(content)))

	c.Data(http.StatusOK, "application/zip", content)
}

func (h *APIHandler) exportAll(c *gin.Context) {
	content, filename, err := h.DocumentService.ExportAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Export failed: " + err.Error(),
		})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Length", fmt.Sprintf("%d", len(content)))

	c.Data(http.StatusOK, "application/zip", content)
}

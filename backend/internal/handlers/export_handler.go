package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *APIHandler) exportDocument(c *gin.Context) {
	path := pathParam(c)

	content, filename, err := h.DocumentService.ExportDocument(path)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", "text/markdown; charset=utf-8")
	c.Header("Content-Length", fmt.Sprintf("%d", len(content)))

	c.Data(http.StatusOK, "text/markdown", content)
}

func (h *APIHandler) exportFolder(c *gin.Context) {
	path := pathParam(c)

	content, filename, err := h.DocumentService.ExportFolder(path)
	if err != nil {
		HandleError(c, err)
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
		HandleError(c, err)
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Length", fmt.Sprintf("%d", len(content)))

	c.Data(http.StatusOK, "application/zip", content)
}

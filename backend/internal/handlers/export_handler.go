package handlers

import (
	"github.com/gin-gonic/gin"
)

func (h *APIHandler) exportDocument(c *gin.Context) {
	path := pathParam(c)

	content, filename, err := h.DocumentService.ExportDocument(path)
	if err != nil {
		HandleError(c, err)
		return
	}

	sendAttachment(c, filename, "text/markdown; charset=utf-8", content)
}

func (h *APIHandler) exportFolder(c *gin.Context) {
	path := pathParam(c)

	content, filename, err := h.DocumentService.ExportFolder(path)
	if err != nil {
		HandleError(c, err)
		return
	}

	sendAttachment(c, filename, "application/zip", content)
}

func (h *APIHandler) exportAll(c *gin.Context) {
	content, filename, err := h.DocumentService.ExportAll()
	if err != nil {
		HandleError(c, err)
		return
	}

	sendAttachment(c, filename, "application/zip", content)
}

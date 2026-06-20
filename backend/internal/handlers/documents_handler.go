package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/utils"
	"github.com/gin-gonic/gin"
)

func (h *APIHandler) listDocuments(c *gin.Context) {
	documents, err := h.DocumentService.ListDocuments()
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"documents": documents,
		"total":     len(documents),
	})
}

func (h *APIHandler) createDocument(c *gin.Context) {
	document := &models.Document{}
	if apiErr := ValidateJSONBody(c, document); apiErr != nil {
		HandleError(c, apiErr)
		return
	}

	err := h.DocumentService.CreateDocument(document)
	if err != nil {
		HandleError(c, err)
		return
	}

	if err := h.LinkService.UpdateBacklinks(document.MetaData.Path); err != nil {
		fmt.Printf("Warning: failed to update backlinks for new document %s: %v\n", document.MetaData.Path, err)
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Document created successfully",
		"path":    document.MetaData.Path,
	})
}

func (h *APIHandler) getDocumentByPath(c *gin.Context) {
	path, apiErr := ValidatePathParameter(c, "path")
	if apiErr != nil {
		HandleError(c, apiErr)
		return
	}
	path = utils.EnsureLeadingSlash(path)

	document, err := h.DocumentService.GetDocumentByPath(path)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, document)
}

func (h *APIHandler) checkDocumentExists(c *gin.Context) {
	path, apiErr := ValidatePathParameter(c, "path")
	if apiErr != nil {
		HandleError(c, apiErr)
		return
	}
	path = utils.EnsureLeadingSlash(path)

	_, err := h.DocumentService.GetDocumentByPath(path)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.Status(http.StatusOK)
}

func (h *APIHandler) updateDocumentByPath(c *gin.Context) {
	path, apiErr := ValidatePathParameter(c, "path")
	if apiErr != nil {
		HandleError(c, apiErr)
		return
	}
	path = utils.EnsureLeadingSlash(path)

	type UpdateDocumentRequest struct {
		*models.Document
		SaveType string `json:"saveType,omitempty"` // "manual" or "auto", defaults to "manual"
	}

	var req UpdateDocumentRequest
	if apiErr := ValidateJSONBody(c, &req); apiErr != nil {
		HandleError(c, apiErr)
		return
	}

	saveType := req.SaveType
	if saveType == "" {
		saveType = "manual"
	}

	updatedDocument := req.Document
	updatedDocument.MetaData.Updated = time.Now()

	if err := h.DocumentService.MoveDocument(path, updatedDocument.MetaData.Path); err != nil {
		HandleError(c, err)
		return
	}

	if err := h.DocumentService.UpdateDocumentWithSaveType(updatedDocument, saveType); err != nil {
		HandleError(c, err)
		return
	}

	if err := h.LinkService.UpdateBacklinks(updatedDocument.MetaData.Path); err != nil {
		fmt.Printf("Warning: failed to update backlinks for updated document %s: %v\n", updatedDocument.MetaData.Path, err)
	}

	c.JSON(http.StatusOK, updatedDocument)
}

func (h *APIHandler) deleteDocumentByPath(c *gin.Context) {
	path, apiErr := ValidatePathParameter(c, "path")
	if apiErr != nil {
		HandleError(c, apiErr)
		return
	}
	path = utils.EnsureLeadingSlash(path)

	if strings.HasPrefix(path, "/trash") {
		if err := h.DocumentService.DeleteDocument(path); err != nil {
			HandleError(c, err)
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Document permanently deleted",
			"path":    path,
		})
		return
	}

	pathWithoutLeadingSlash := strings.TrimPrefix(path, "/")
	trashPath := "/trash/" + pathWithoutLeadingSlash
	err := h.DocumentService.MoveDocument(path, trashPath)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Document moved to trash successfully",
		"path":    path,
	})
}

func (h *APIHandler) moveDocument(c *gin.Context) {
	type MoveRequest struct {
		OldPath string `json:"oldPath" binding:"required"`
		NewPath string `json:"newPath" binding:"required"`
	}

	var req MoveRequest
	if apiErr := ValidateJSONBody(c, &req); apiErr != nil {
		HandleError(c, apiErr)
		return
	}

	req.OldPath = utils.EnsureLeadingSlash(req.OldPath)
	req.NewPath = utils.EnsureLeadingSlash(req.NewPath)

	if err := h.DocumentService.MoveDocument(req.OldPath, req.NewPath); err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Document moved successfully",
		"oldPath": req.OldPath,
		"newPath": req.NewPath,
	})
}

package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/gin-gonic/gin"
)

func (h *APIHandler) listDocuments(c *gin.Context) {
	documents, err := h.DocumentService.ListDocuments()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"documents": documents,
		"total":     len(documents),
	})
}

func (h *APIHandler) createDocument(c *gin.Context) {
	document := &models.Document{}
	err := c.BindJSON(document)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	err = h.DocumentService.CreateDocument(document)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	if err := h.LinkService.UpdateBacklinks(document.MetaData.Path); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to update backlinks for new document %s: %v\n", document.MetaData.Path, err)
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Document created successfully",
		"path":    document.MetaData.Path,
	})
}

func (h *APIHandler) getDocumentByPath(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	document, err := h.DocumentService.GetDocumentByPath(path)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, document)
}

func (h *APIHandler) updateDocumentByPath(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	type UpdateDocumentRequest struct {
		*models.Document
		SaveType string `json:"saveType,omitempty"` // "manual" or "auto", defaults to "manual"
	}

	var req UpdateDocumentRequest
	err := c.BindJSON(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	saveType := req.SaveType
	if saveType == "" {
		saveType = "manual"
	}

	updatedDocument := req.Document
	updatedDocument.MetaData.Updated = time.Now()

	if err := h.DocumentService.MoveDocument(path, updatedDocument.MetaData.Path); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to move document: %v", err),
		})
		return
	}

	err = h.DocumentService.UpdateDocumentWithSaveType(updatedDocument, saveType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	if err := h.LinkService.UpdateBacklinks(updatedDocument.MetaData.Path); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to update backlinks for updated document %s: %v\n", updatedDocument.MetaData.Path, err)
	}

	c.JSON(http.StatusOK, updatedDocument)
}

func (h *APIHandler) deleteDocumentByPath(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	if strings.HasPrefix(path, "/trash") {
		err := h.DocumentService.DeleteDocument(path)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
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
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Document moved to trash successfully",
		"path":    path,
	})
}

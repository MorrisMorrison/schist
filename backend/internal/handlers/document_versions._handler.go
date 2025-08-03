package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// getDocumentVersions returns version history for a document
func (h *APIHandler) getDocumentVersions(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "path parameter is required",
		})
		return
	}

	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	versions, err := h.DocumentService.GetDocumentVersions(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"path":     path,
		"versions": versions,
		"total":    len(versions),
	})
}

// getDocumentAtVersion returns a document at a specific version
func (h *APIHandler) getDocumentAtVersion(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "path parameter is required",
		})
		return
	}

	commitHash := c.Query("hash")
	if commitHash == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "hash parameter is required",
		})
		return
	}

	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	document, err := h.DocumentService.GetDocumentAtVersion(path, commitHash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"path":     path,
		"hash":     commitHash,
		"document": document,
	})
}

// compareDocumentVersions compares two versions of a document and returns the diff
func (h *APIHandler) compareDocumentVersions(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "path parameter is required",
		})
		return
	}

	hash1 := c.Query("hash1")
	if hash1 == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "hash1 parameter is required",
		})
		return
	}

	hash2 := c.Query("hash2")
	if hash2 == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "hash2 parameter is required",
		})
		return
	}

	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	diff, err := h.DocumentService.CompareDocumentVersions(path, hash1, hash2)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"diff": diff,
	})
}

// restoreDocumentVersion restores a document to a previous version
func (h *APIHandler) restoreDocumentVersion(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "path parameter is required",
		})
		return
	}

	commitHash := c.Query("hash")
	if commitHash == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "hash parameter is required",
		})
		return
	}

	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	err := h.DocumentService.RestoreDocumentToVersion(path, commitHash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Document restored successfully",
		"path":    path,
		"hash":    commitHash,
	})
}

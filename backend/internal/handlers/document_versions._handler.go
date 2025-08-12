package handlers

import (
	"net/http"

	"github.com/MorrisMorrison/schist/internal/utils"
	"github.com/gin-gonic/gin"
)

func (h *APIHandler) getDocumentVersions(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "path parameter is required",
		})
		return
	}

	path = utils.EnsureLeadingSlash(path)

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

	path = utils.EnsureLeadingSlash(path)

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

	path = utils.EnsureLeadingSlash(path)

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

	path = utils.EnsureLeadingSlash(path)

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

package handlers

import (
	"net/http"

	"github.com/MorrisMorrison/schist/internal/utils"
	"github.com/gin-gonic/gin"
)

func (h *APIHandler) getDocumentVersions(c *gin.Context) {
	path, ok := requiredQuery(c, "path")
	if !ok {
		return
	}

	path = utils.EnsureLeadingSlash(path)

	versions, err := h.DocumentService.GetDocumentVersions(path)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"path":     path,
		"versions": versions,
		"total":    len(versions),
	})
}

func (h *APIHandler) getDocumentAtVersion(c *gin.Context) {
	path, ok := requiredQuery(c, "path")
	if !ok {
		return
	}

	commitHash, ok := requiredQuery(c, "hash")
	if !ok {
		return
	}

	path = utils.EnsureLeadingSlash(path)

	document, err := h.DocumentService.GetDocumentAtVersion(path, commitHash)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"path":     path,
		"hash":     commitHash,
		"document": document,
	})
}

func (h *APIHandler) compareDocumentVersions(c *gin.Context) {
	path, ok := requiredQuery(c, "path")
	if !ok {
		return
	}

	hash1, ok := requiredQuery(c, "hash1")
	if !ok {
		return
	}

	hash2, ok := requiredQuery(c, "hash2")
	if !ok {
		return
	}

	path = utils.EnsureLeadingSlash(path)

	diff, err := h.DocumentService.CompareDocumentVersions(path, hash1, hash2)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"diff": diff,
	})
}

func (h *APIHandler) restoreDocumentVersion(c *gin.Context) {
	path, ok := requiredQuery(c, "path")
	if !ok {
		return
	}

	commitHash, ok := requiredQuery(c, "hash")
	if !ok {
		return
	}

	path = utils.EnsureLeadingSlash(path)

	err := h.DocumentService.RestoreDocumentToVersion(path, commitHash)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Document restored successfully",
		"path":    path,
		"hash":    commitHash,
	})
}

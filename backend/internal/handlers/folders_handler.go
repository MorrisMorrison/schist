package handlers

import (
	"net/http"

	"github.com/MorrisMorrison/schist/internal/utils"
	"github.com/gin-gonic/gin"
)

func (h *APIHandler) getFolder(c *gin.Context) {
	path := utils.EnsureLeadingSlash(c.Param("path"))

	folder, err := h.DocumentService.GetFolder(path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, folder)
}

func (h *APIHandler) getFolderTree(c *gin.Context) {
	folders, err := h.DocumentService.GetFolderTree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"folders": folders,
		"total":   len(folders),
	})
}

func (h *APIHandler) createFolder(c *gin.Context) {
	type CreateFolderRequest struct {
		Path string `json:"path" binding:"required"`
	}

	var req CreateFolderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request: " + err.Error(),
		})
		return
	}

	path := utils.EnsureLeadingSlash(req.Path)

	err := h.DocumentService.CreateFolder(path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Folder created successfully",
		"path":    path,
	})
}

func (h *APIHandler) renameFolder(c *gin.Context) {
	path := utils.EnsureLeadingSlash(c.Param("path"))

	type RenameRequest struct {
		NewName string `json:"newName" binding:"required"`
	}

	var req RenameRequest
	err := c.BindJSON(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	err = h.DocumentService.RenameFolder(path, req.NewName)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Folder renamed successfully",
		"path":    path,
		"newName": req.NewName,
	})
}

func (h *APIHandler) deleteFolder(c *gin.Context) {
	path := utils.EnsureLeadingSlash(c.Param("path"))

	err := h.DocumentService.DeleteFolder(path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Folder deleted successfully",
		"path":    path,
	})
}

func (h *APIHandler) moveFolder(c *gin.Context) {
	type MoveFolderRequest struct {
		OldPath string `json:"oldPath" binding:"required"`
		NewPath string `json:"newPath" binding:"required"`
	}

	var req MoveFolderRequest
	err := c.BindJSON(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	req.OldPath = utils.EnsureLeadingSlash(req.OldPath)
	req.NewPath = utils.EnsureLeadingSlash(req.NewPath)

	err = h.DocumentService.MoveFolder(req.OldPath, req.NewPath)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Folder moved successfully",
		"oldPath": req.OldPath,
		"newPath": req.NewPath,
	})
}

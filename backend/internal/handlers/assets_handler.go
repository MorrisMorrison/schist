package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *APIHandler) uploadAsset(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "No file provided",
		})
		return
	}

	asset, err := h.AssetService.UploadImage(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Asset uploaded successfully",
		"asset":   asset,
	})
}

func (h *APIHandler) serveAsset(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	assetPath := "/assets" + path

	fullPath, err := h.AssetService.GetAssetPath(assetPath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.File(fullPath)
}

func (h *APIHandler) deleteAsset(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	assetPath := strings.TrimPrefix(path, "/assets")
	if assetPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid asset path",
		})
		return
	}

	err := h.AssetService.DeleteAsset("assets" + assetPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Asset deleted successfully",
		"path":    path,
	})
}

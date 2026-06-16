package handlers

import (
	"net/http"
	"strings"

	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/utils"
	"github.com/gin-gonic/gin"
)

func (h *APIHandler) uploadAsset(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		HandleError(c, errors.NewValidationError("No file provided").WithCause(err))
		return
	}

	asset, err := h.AssetService.UploadImage(file)
	if err != nil {
		HandleError(c, errors.NewValidationError(err.Error()).WithCause(err))
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Asset uploaded successfully",
		"asset":   asset,
	})
}

func (h *APIHandler) serveAsset(c *gin.Context) {
	path := utils.EnsureLeadingSlash(c.Param("path"))

	assetPath := "/assets" + path

	fullPath, err := h.AssetService.GetAssetPath(assetPath)
	if err != nil {
		HandleError(c, errors.NewNotFoundError("asset", assetPath).WithCause(err))
		return
	}

	c.File(fullPath)
}

func (h *APIHandler) deleteAsset(c *gin.Context) {
	path := utils.EnsureLeadingSlash(c.Param("path"))

	assetPath := strings.TrimPrefix(path, "/assets")
	if assetPath == "" {
		HandleError(c, errors.NewValidationError("Invalid asset path"))
		return
	}

	err := h.AssetService.DeleteAsset("assets" + assetPath)
	if err != nil {
		HandleError(c, errors.NewFileSystemError("delete asset", err))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Asset deleted successfully",
		"path":    path,
	})
}

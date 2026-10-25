package handlers

import (
	"net/http"

	"github.com/MorrisMorrison/schist/internal/errors"
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
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Asset uploaded successfully",
		"asset":   asset,
	})
}

// assetPathParam maps the catch-all route parameter of /api/assets/*path
// (e.g. "/images/x.png") to the logical asset path "/assets/images/x.png".
func assetPathParam(c *gin.Context) string {
	return "/assets" + pathParam(c)
}

func (h *APIHandler) serveAsset(c *gin.Context) {
	fullPath, err := h.AssetService.GetAssetPath(assetPathParam(c))
	if err != nil {
		HandleError(c, err)
		return
	}

	c.File(fullPath)
}

func (h *APIHandler) deleteAsset(c *gin.Context) {
	path := pathParam(c)
	if path == "/" {
		HandleError(c, errors.NewValidationError("Invalid asset path"))
		return
	}

	// Previously this built "assets/..." without a leading slash, which the
	// path validation always rejected, so every delete failed with a 500.
	if err := h.AssetService.DeleteAsset(assetPathParam(c)); err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Asset deleted successfully",
		"path":    path,
	})
}

package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-gonic/gin"
)

type APIHandler struct {
	PageService  *services.PageService
	AssetService *services.AssetService
}

func NewAPIHandler() *APIHandler {
	dataDir := config.Load().DataDir
	return &APIHandler{
		PageService:  services.NewPageService(dataDir),
		AssetService: services.NewAssetService(dataDir),
	}
}

func (h *APIHandler) SetupAPIRoutes(r *gin.RouterGroup) {
	r.GET("/health", h.healthCheck)

	pages := r.Group("/pages")
	{
		pages.GET("", h.listPages)
		pages.POST("", h.createPage)
		pages.GET("/*path", h.getPageByPath)
		pages.PUT("/*path", h.updatePageByPath)
		pages.DELETE("/*path", h.deletePageByPath)
		pages.POST("/move", h.movePage)
	}

	folders := r.Group("/folders")
	{
		folders.GET("", h.getFolderTree)
		folders.GET("/*path", h.getFolder)
		folders.POST("/*path", h.createFolder)
		folders.DELETE("/*path", h.deleteFolder)
	}

	r.GET("/search", h.search)

	assets := r.Group("/assets")
	{
		assets.POST("/upload", h.uploadAsset)
		assets.GET("/*path", h.serveAsset)
		assets.DELETE("/*path", h.deleteAsset)
	}
}

func (h *APIHandler) healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "schist",
	})
}

func (h *APIHandler) listPages(c *gin.Context) {
	pages, err := h.PageService.ListPages()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"pages": pages,
		"total": len(pages),
	})
}

func (h *APIHandler) createPage(c *gin.Context) {
	page := &models.Page{}
	err := c.BindJSON(page)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	err = h.PageService.CreatePage(page)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Page created successfully",
		"path":    page.MetaData.Path,
	})
}

func (h *APIHandler) search(c *gin.Context) {
	query := c.Query("q")
	c.JSON(http.StatusOK, gin.H{
		"query":   query,
		"results": []gin.H{},
		"total":   0,
	})
}

func (h *APIHandler) getPageByPath(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	page, err := h.PageService.GetPageByPath(path)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, page)
}

// TODO move logic out of handler
func (h *APIHandler) updatePageByPath(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	// existingPage, err := h.PageService.GetPageByPath(path)
	// if err != nil {
	// 	c.JSON(http.StatusNotFound, gin.H{
	// 		"error": err.Error(),
	// 	})
	// 	return
	// }

	updatedPage := &models.Page{}
	err := c.BindJSON(updatedPage)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	updatedPage.MetaData.Updated = time.Now()
	h.PageService.MovePage(path, updatedPage.MetaData.Path)

	err = h.PageService.UpdatePage(updatedPage)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Page updated successfully",
		"path":    path,
	})
}

func (h *APIHandler) deletePageByPath(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	trashPath := "/trash" + path
	err := h.PageService.MovePage(path, trashPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Page moved to trash successfully",
		"path":    path,
	})
}

func (h *APIHandler) getFolder(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	folder, err := h.PageService.GetFolder(path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, folder)
}

func (h *APIHandler) getFolderTree(c *gin.Context) {
	folders, err := h.PageService.GetFolderTree()
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
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	err := h.PageService.CreateFolder(path)
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

func (h *APIHandler) deleteFolder(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	err := h.PageService.DeleteFolder(path)
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

func (h *APIHandler) movePage(c *gin.Context) {
	// TODO move out of handler
	type MoveRequest struct {
		OldPath string `json:"oldPath" binding:"required"`
		NewPath string `json:"newPath" binding:"required"`
	}

	var req MoveRequest
	err := c.BindJSON(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// TODO use existing path validation
	if !strings.HasPrefix(req.OldPath, "/") {
		req.OldPath = "/" + req.OldPath
	}
	if !strings.HasPrefix(req.NewPath, "/") {
		req.NewPath = "/" + req.NewPath
	}

	err = h.PageService.MovePage(req.OldPath, req.NewPath)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Page moved successfully",
		"oldPath": req.OldPath,
		"newPath": req.NewPath,
	})
}

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

	// The path comes in as /images/test.png, we need to add /assets prefix  
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

	// Remove /assets prefix from path
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

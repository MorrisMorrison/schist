package handlers

import (
	"fmt"
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
	LinkService  *services.LinkService
}

func NewAPIHandler() *APIHandler {
	dataDir := config.Load().DataDir
	pageService := services.NewPageService(dataDir)
	return &APIHandler{
		PageService:  pageService,
		AssetService: services.NewAssetService(dataDir),
		LinkService:  services.NewLinkService(pageService),
	}
}

func (h *APIHandler) SetupAPIRoutes(routerGroup *gin.RouterGroup) {
	routerGroup.GET("/health", h.healthCheck)

	pages := routerGroup.Group("/pages")
	{
		pages.GET("", h.listPages)
		pages.POST("", h.createPage)
		pages.POST("/move", h.movePage)
		pages.GET("/*path", h.getPageByPath)
		pages.PUT("/*path", h.updatePageByPath)
		pages.DELETE("/*path", h.deletePageByPath)
	}

	// Link-related routes - these need to be defined separately to avoid wildcard conflicts
	routerGroup.GET("/links/broken", h.getBrokenLinks)

	// Define link routes using specific handlers that extract path from the full route
	linkRoutes := routerGroup.Group("/links")
	{
		linkRoutes.GET("/outgoing/*path", h.getPageLinksHandler)
		linkRoutes.GET("/backlinks/*path", h.getPageBacklinksHandler)
	}

	folders := routerGroup.Group("/folders")
	{
		folders.GET("", h.getFolderTree)
		folders.POST("", h.createFolder)
		folders.POST("/move", h.moveFolder)
		folders.GET("/*path", h.getFolder)
		folders.PUT("/*path", h.renameFolder)
		folders.DELETE("/*path", h.deleteFolder)
	}

	routerGroup.GET("/search", h.search)
	routerGroup.GET("/tags", h.getAllTags)
	routerGroup.GET("/versions", h.getDocumentVersions)
	routerGroup.GET("/versions/document", h.getDocumentAtVersion)
	routerGroup.GET("/versions/diff", h.compareDocumentVersions)
	routerGroup.POST("/versions/restore", h.restoreDocumentVersion)

	assets := routerGroup.Group("/assets")
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

	// Update backlinks for the newly created page
	if err := h.LinkService.UpdateBacklinks(page.MetaData.Path); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to update backlinks for new page %s: %v\n", page.MetaData.Path, err)
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Page created successfully",
		"path":    page.MetaData.Path,
	})
}

func (h *APIHandler) search(c *gin.Context) {
	query := c.Query("q")
	pages, err := h.PageService.Search(query)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"query": query,
		"pages": pages,
		"total": len(pages),
	})
}

func (h *APIHandler) getAllTags(c *gin.Context) {
	tagCounts, err := h.PageService.GetAllTags()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// Convert map to sorted slice for consistent output
	type TagInfo struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}

	var tags []TagInfo
	for name, count := range tagCounts {
		tags = append(tags, TagInfo{
			Name:  name,
			Count: count,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"tags":  tags,
		"total": len(tags),
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

func (h *APIHandler) updatePageByPath(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	// Parse request body to extract both page data and saveType
	type UpdatePageRequest struct {
		*models.Page
		SaveType string `json:"saveType,omitempty"` // "manual" or "auto", defaults to "manual"
	}

	var req UpdatePageRequest
	err := c.BindJSON(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// Default to manual save if not specified
	saveType := req.SaveType
	if saveType == "" {
		saveType = "manual"
	}

	updatedPage := req.Page
	updatedPage.MetaData.Updated = time.Now()

	if err := h.PageService.MovePage(path, updatedPage.MetaData.Path); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to move page: %v", err),
		})
		return
	}

	err = h.PageService.UpdatePageWithSaveType(updatedPage, saveType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	// Update backlinks for the updated page
	if err := h.LinkService.UpdateBacklinks(updatedPage.MetaData.Path); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to update backlinks for updated page %s: %v\n", updatedPage.MetaData.Path, err)
	}

	c.JSON(http.StatusOK, updatedPage)
}

func (h *APIHandler) deletePageByPath(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	// If the page is already in trash, permanently delete it
	if strings.HasPrefix(path, "/trash") {
		err := h.PageService.DeletePage(path)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Page permanently deleted",
			"path":    path,
		})
		return
	}

	// Otherwise, move to trash
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

	path := req.Path
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

func (h *APIHandler) renameFolder(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

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

	err = h.PageService.RenameFolder(path, req.NewName)
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

	if !strings.HasPrefix(req.OldPath, "/") {
		req.OldPath = "/" + req.OldPath
	}
	if !strings.HasPrefix(req.NewPath, "/") {
		req.NewPath = "/" + req.NewPath
	}

	err = h.PageService.MoveFolder(req.OldPath, req.NewPath)
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

func (h *APIHandler) movePage(c *gin.Context) {
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

// getPageLinksHandler returns all outgoing links for a specific page (new route structure)
func (h *APIHandler) getPageLinksHandler(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	links, err := h.LinkService.GetOutgoingLinks(path)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"path":  path,
		"links": links,
		"total": len(links),
	})
}

// getPageBacklinksHandler returns all pages that link to the specified page (new route structure)
func (h *APIHandler) getPageBacklinksHandler(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	backlinks, err := h.LinkService.GetBacklinks(path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// Get page metadata for each backlink
	var backlinkPages []*models.Page
	for _, backlinkPath := range backlinks {
		page, err := h.PageService.GetPageByPath(backlinkPath)
		if err == nil {
			backlinkPages = append(backlinkPages, page)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"path":      path,
		"backlinks": backlinkPages,
		"total":     len(backlinkPages),
	})
}

// getBrokenLinks returns all broken links across all pages
func (h *APIHandler) getBrokenLinks(c *gin.Context) {
	brokenLinks, err := h.LinkService.GetBrokenLinks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"broken_links": brokenLinks,
		"total_pages":  len(brokenLinks),
	})
}

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

	versions, err := h.PageService.GetDocumentVersions(path)
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

	page, err := h.PageService.GetDocumentAtVersion(path, commitHash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"path": path,
		"hash": commitHash,
		"page": page,
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

	diff, err := h.PageService.CompareDocumentVersions(path, hash1, hash2)
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

	err := h.PageService.RestorePageToVersion(path, commitHash)
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

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
	DocumentService *services.DocumentService
	AssetService    *services.AssetService
	LinkService     *services.LinkService
	GitHubService   *services.GitHubService
}

func NewAPIHandler() *APIHandler {
	cfg := config.Load()
	dataDir := cfg.DataDir
	documentService := services.NewDocumentService(dataDir)

	gitService, err := services.NewGitService(dataDir)
	if err != nil {
		fmt.Printf("Warning: failed to initialize git service: %v\n", err)
	}

	return &APIHandler{
		DocumentService: documentService,
		AssetService:    services.NewAssetService(dataDir),
		LinkService:     services.NewLinkService(documentService),
		GitHubService:   services.NewGitHubService(cfg, gitService),
	}
}

func (h *APIHandler) SetupAPIRoutes(routerGroup *gin.RouterGroup) {
	routerGroup.GET("/health", h.healthCheck)

	routerGroup.POST("/import/documents", h.importDocuments)

	exportRoutes := routerGroup.Group("/export")
	{
		exportRoutes.GET("/document/*path", h.exportDocument)
		exportRoutes.GET("/folder/*path", h.exportFolder)
		exportRoutes.GET("/all", h.exportAll)
	}

	documents := routerGroup.Group("/documents")
	{
		documents.GET("", h.listDocuments)
		documents.POST("", h.createDocument)
		documents.POST("/move", h.moveDocument)
		documents.GET("/*path", h.getDocumentByPath)
		documents.PUT("/*path", h.updateDocumentByPath)
		documents.DELETE("/*path", h.deleteDocumentByPath)
	}

	// Link-related routes - these need to be defined separately to avoid wildcard conflicts
	routerGroup.GET("/links/broken", h.getBrokenLinks)

	// Define link routes using specific handlers that extract path from the full route
	linkRoutes := routerGroup.Group("/links")
	{
		linkRoutes.GET("/outgoing/*path", h.getDocumentLinksHandler)
		linkRoutes.GET("/backlinks/*path", h.getDocumentBacklinksHandler)
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

	github := routerGroup.Group("/github")
	{
		github.POST("/setup", h.setupGitHub)
		github.GET("/status", h.getGitHubStatus)
		github.POST("/sync", h.syncToGitHub)
		github.PUT("/config", h.updateGitHubConfig)
	}
}

func (h *APIHandler) healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "schist",
	})
}

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

	// Update backlinks for the newly created document
	if err := h.LinkService.UpdateBacklinks(document.MetaData.Path); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to update backlinks for new document %s: %v\n", document.MetaData.Path, err)
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Document created successfully",
		"path":    document.MetaData.Path,
	})
}

func (h *APIHandler) search(c *gin.Context) {
	query := c.Query("q")
	documents, err := h.DocumentService.Search(query)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"query":     query,
		"documents": documents,
		"total":     len(documents),
	})
}

func (h *APIHandler) getAllTags(c *gin.Context) {
	tagCounts, err := h.DocumentService.GetAllTags()
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

	// Parse request body to extract both document data and saveType
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

	// Default to manual save if not specified
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

	// Update backlinks for the updated document
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

	// If the document is already in trash, permanently delete it
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

	// Otherwise, move to trash
	// Remove leading slash from path to avoid double slash
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

func (h *APIHandler) getFolder(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

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

	path := req.Path
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

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
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

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

	if !strings.HasPrefix(req.OldPath, "/") {
		req.OldPath = "/" + req.OldPath
	}
	if !strings.HasPrefix(req.NewPath, "/") {
		req.NewPath = "/" + req.NewPath
	}

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

func (h *APIHandler) moveDocument(c *gin.Context) {
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

	err = h.DocumentService.MoveDocument(req.OldPath, req.NewPath)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Document moved successfully",
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

// getDocumentLinksHandler returns all outgoing links for a specific document (new route structure)
func (h *APIHandler) getDocumentLinksHandler(c *gin.Context) {
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

// getDocumentBacklinksHandler returns all documents that link to the specified document (new route structure)
func (h *APIHandler) getDocumentBacklinksHandler(c *gin.Context) {
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

	// Get document metadata for each backlink
	var backlinkDocuments []*models.Document
	for _, backlinkPath := range backlinks {
		document, err := h.DocumentService.GetDocumentByPath(backlinkPath)
		if err == nil {
			backlinkDocuments = append(backlinkDocuments, document)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"path":      path,
		"backlinks": backlinkDocuments,
		"total":     len(backlinkDocuments),
	})
}

// getBrokenLinks returns all broken links across all documents
func (h *APIHandler) getBrokenLinks(c *gin.Context) {
	brokenLinks, err := h.LinkService.GetBrokenLinks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"broken_links":    brokenLinks,
		"total_documents": len(brokenLinks),
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

// importDocuments handles document import requests
func (h *APIHandler) importDocuments(c *gin.Context) {
	// Parse multipart form
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid form data: " + err.Error(),
		})
		return
	}

	// Get uploaded files
	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "No files provided",
		})
		return
	}

	// Parse import options
	options := &models.ImportOptions{
		TargetPath:    c.PostForm("target_path"),
		OverwriteMode: c.PostForm("overwrite_mode"),
	}

	// Set default overwrite mode if not specified
	if options.OverwriteMode == "" {
		options.OverwriteMode = "rename"
	}

	// Import documents
	result, err := h.DocumentService.ImportDocuments(files, options)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Import failed: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, result)
}

// Export handlers

// exportDocument handles single document export requests
func (h *APIHandler) exportDocument(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	// Export the document
	content, filename, err := h.DocumentService.ExportDocument(path)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Export failed: " + err.Error(),
		})
		return
	}

	// Set headers for file download
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", "text/markdown; charset=utf-8")
	c.Header("Content-Length", fmt.Sprintf("%d", len(content)))

	// Send the file content
	c.Data(http.StatusOK, "text/markdown", content)
}

// exportFolder handles folder export requests
func (h *APIHandler) exportFolder(c *gin.Context) {
	path := c.Param("path")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	// Export the folder
	content, filename, err := h.DocumentService.ExportFolder(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Export failed: " + err.Error(),
		})
		return
	}

	// Set headers for zip file download
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Length", fmt.Sprintf("%d", len(content)))

	// Send the zip file content
	c.Data(http.StatusOK, "application/zip", content)
}

// exportAll handles export all documents requests
func (h *APIHandler) exportAll(c *gin.Context) {
	// Export all documents
	content, filename, err := h.DocumentService.ExportAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Export failed: " + err.Error(),
		})
		return
	}

	// Set headers for zip file download
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Length", fmt.Sprintf("%d", len(content)))

	// Send the zip file content
	c.Data(http.StatusOK, "application/zip", content)
}

// GitHub integration handlers

func (h *APIHandler) setupGitHub(c *gin.Context) {
	var req services.GitHubSetupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request: " + err.Error(),
		})
		return
	}

	// Validate required fields
	if strings.TrimSpace(req.Token) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "GitHub token is required",
		})
		return
	}

	if strings.TrimSpace(req.Owner) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository owner is required",
		})
		return
	}

	if strings.TrimSpace(req.Repo) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository name is required",
		})
		return
	}

	repoInfo, err := h.GitHubService.SetupRepository(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Failed to setup GitHub repository: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "GitHub repository setup successfully",
		"repository":   repoInfo,
		"auto_sync":    req.AutoSync,
		"sync_on_save": req.SyncOnSave,
	})
}

func (h *APIHandler) getGitHubStatus(c *gin.Context) {
	status, err := h.GitHubService.GetSyncStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to get GitHub status: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, status)
}

func (h *APIHandler) syncToGitHub(c *gin.Context) {
	if !h.GitHubService.IsEnabled() {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "GitHub integration is not enabled",
		})
		return
	}

	result, err := h.GitHubService.SyncToGitHub()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Sync failed: %v", err),
		})
		return
	}

	if !result.Success && result.Error != "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": result.Error,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Sync completed successfully",
		"result":  result,
	})
}

func (h *APIHandler) updateGitHubConfig(c *gin.Context) {
	if !h.GitHubService.IsEnabled() {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "GitHub integration is not enabled",
		})
		return
	}

	var req services.GitHubConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request: " + err.Error(),
		})
		return
	}

	if err := h.GitHubService.UpdateConfiguration(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Failed to update configuration: %v", err),
		})
		return
	}

	// Return updated status
	status, err := h.GitHubService.GetSyncStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Configuration updated but failed to get status: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "GitHub configuration updated successfully",
		"status":  status,
	})
}

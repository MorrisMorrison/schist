package handlers

import (
	"net/http"
	"strings"

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

func NewAPIHandler(services *services.Services) *APIHandler {
	return &APIHandler{
		DocumentService: services.DocumentService,
		AssetService:    services.AssetService,
		LinkService:     services.LinkService,
		GitHubService:   services.GitHubService,
	}
}

func (h *APIHandler) SetupAPIRoutes(routerGroup *gin.RouterGroup) {
	routerGroup.GET("/health", h.healthCheck)
	documents := routerGroup.Group("/documents")
	{
		documents.GET("", h.listDocuments)
		documents.POST("", h.createDocument)
		documents.POST("/move", h.moveDocument)
		documents.GET("/*path", h.getDocumentByPath)
		documents.PUT("/*path", h.updateDocumentByPath)
		documents.DELETE("/*path", h.deleteDocumentByPath)
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

	assets := routerGroup.Group("/assets")
	{
		assets.POST("/upload", h.uploadAsset)
		assets.GET("/*path", h.serveAsset)
		assets.DELETE("/*path", h.deleteAsset)
	}

	linkRoutes := routerGroup.Group("/links")
	{
		linkRoutes.GET("/broken", h.getBrokenLinks)
		linkRoutes.GET("/outgoing/*path", h.getDocumentLinksHandler)
		linkRoutes.GET("/backlinks/*path", h.getDocumentBacklinksHandler)
	}

	versions := routerGroup.Group("/versions")
	{
		versions.GET("/", h.getDocumentVersions)
		versions.GET("/document", h.getDocumentAtVersion)
		versions.GET("/diff", h.compareDocumentVersions)
		versions.POST("/restore", h.restoreDocumentVersion)
	}

	github := routerGroup.Group("/github")
	{
		github.POST("/setup", h.setupGitHub)
		github.POST("/test", h.testGitHubConnection)
		github.GET("/status", h.getGitHubStatus)
		github.POST("/sync", h.syncToGitHub)
		github.PUT("/config", h.updateGitHubConfig)
	}

	exportRoutes := routerGroup.Group("/export")
	{
		exportRoutes.GET("/document/*path", h.exportDocument)
		exportRoutes.GET("/folder/*path", h.exportFolder)
		exportRoutes.GET("/all", h.exportAll)
	}

	routerGroup.POST("/import/documents", h.importDocuments)
	routerGroup.GET("/search", h.search)
	routerGroup.GET("/tags", h.getAllTags)
}

func (h *APIHandler) healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "schist",
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

// importDocuments handles document import requests
func (h *APIHandler) importDocuments(c *gin.Context) {
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid form data: " + err.Error(),
		})
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "No files provided",
		})
		return
	}

	options := &models.ImportOptions{
		TargetPath:    c.PostForm("target_path"),
		OverwriteMode: c.PostForm("overwrite_mode"),
	}

	if options.OverwriteMode == "" {
		options.OverwriteMode = "rename"
	}

	result, err := h.DocumentService.ImportDocuments(files, options)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Import failed: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, result)
}

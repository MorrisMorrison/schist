package handlers

import (
	"fmt"
	"net/http"
	"strings"

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
	AuthService     *services.AuthService
	ShareService    *services.ShareService
	SecretManager   *services.SecretManager
	Config          *config.Config
	Services        *services.Services
}

func NewAPIHandler(services *services.Services) *APIHandler {
	return &APIHandler{
		DocumentService: services.DocumentService,
		AssetService:    services.AssetService,
		LinkService:     services.LinkService,
		GitHubService:   services.GitHubService,
		AuthService:     services.AuthService,
		ShareService:    services.ShareService,
		SecretManager:   services.SecretManager,
		Config:          services.Config,
		Services:        services,
	}
}

func (h *APIHandler) SetupAPIRoutes(routerGroup *gin.RouterGroup) {
	routerGroup.GET("/health", h.healthCheck)
	routerGroup.GET("/config", h.getConfig)

	auth := routerGroup.Group("/auth")
	{
		auth.GET("/setup/required", h.checkSetupRequired)
		auth.POST("/setup/first-user", h.createFirstUser)
		auth.POST("/setup/invite-user", h.createUserFromInvite)
		auth.POST("/login/passkey", h.loginWithPasskey)
		auth.POST("/logout", h.logout)
		auth.GET("/me", h.getCurrentUser)
		auth.POST("/invite", h.generateInviteToken)
		auth.POST("/users", h.createUser)
		auth.GET("/users", h.listUsers)
		auth.DELETE("/users/:username", h.deleteUser)
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
		linkRoutes.GET("/outgoing/*path", h.getDocumentLinks)
		linkRoutes.GET("/backlinks/*path", h.getDocumentBacklinks)
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

	shares := routerGroup.Group("/shares")
	{
		shares.POST("", h.createShare)
		shares.GET("/:token", h.getSharedDocument)
		shares.GET("", h.listShares)
		shares.DELETE("/:id", h.revokeShare)
		shares.POST("/cleanup", h.cleanupExpiredShares)
	}

	secrets := routerGroup.Group("/secrets")
	{
		// Password-based unlock removed - secrets are unlocked via passkey authentication
		secrets.POST("/lock", LockSecretsHandler(h.Services))
		secrets.GET("/status", SecretsStatusHandler(h.Services))
		secrets.GET("", ListSecretsHandler(h.Services))
		secrets.POST("", CreateSecretHandler(h.Services))
		secrets.GET("/:key", GetSecretHandler(h.Services))
		secrets.PUT("/:key", UpdateSecretHandler(h.Services))
		secrets.DELETE("/:key", DeleteSecretHandler(h.Services))
	}

	passkeys := routerGroup.Group("/passkeys")
	{
		// WebAuthn endpoints
		passkeys.POST("/register/begin", BeginPasskeyRegistrationHandler(h.Services))
		passkeys.POST("/register/finish", FinishPasskeyRegistrationHandler(h.Services))
		passkeys.POST("/authenticate/begin", BeginPasskeyAuthenticationHandler(h.Services))
		passkeys.POST("/authenticate/finish", FinishPasskeyAuthenticationHandler(h.Services))

		// Legacy/management endpoints
		passkeys.POST("", CreatePasskeyHandler(h.Services))
		passkeys.GET("", ListPasskeysHandler(h.Services))
		passkeys.POST("/unlock", UnlockWithPasskeyHandler(h.Services))
		passkeys.DELETE("/:id", DeletePasskeyHandler(h.Services))
		passkeys.GET("/status", PasskeyStatusHandler(h.Services))
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

func (h *APIHandler) getConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"auth_enabled": h.Config.AuthEnabled,
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

func (h *APIHandler) getDocumentLinks(c *gin.Context) {
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

func (h *APIHandler) getDocumentBacklinks(c *gin.Context) {
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

type PasskeyLoginRequest struct {
	CredentialID string `json:"credentialId"`
}

func (h *APIHandler) loginWithPasskey(c *gin.Context) {
	var req PasskeyLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request body",
		})
		return
	}

	response, err := h.AuthService.LoginWithPasskey(req.CredentialID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Authentication failed",
		})
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *APIHandler) logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "Logged out successfully",
	})
}

func (h *APIHandler) getCurrentUser(c *gin.Context) {
	username, exists := c.Get("authenticated_user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Not authenticated",
		})
		return
	}

	user, err := h.AuthService.GetUser(username.(string))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "User not found",
		})
		return
	}

	c.JSON(http.StatusOK, user)
}

// Setup and user management handlers

type SetupStatusResponse struct {
	RequiresSetup bool `json:"requires_setup"`
}

func (h *APIHandler) checkSetupRequired(c *gin.Context) {
	isFirstSetup, err := h.AuthService.IsFirstSetup()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to check setup status",
		})
		return
	}

	c.JSON(http.StatusOK, SetupStatusResponse{
		RequiresSetup: isFirstSetup,
	})
}

type CreateFirstUserRequest struct {
	Username     string `json:"username"`
	CredentialID string `json:"credential_id"`
}

func (h *APIHandler) createFirstUser(c *gin.Context) {
	var req CreateFirstUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request body",
		})
		return
	}

	if req.Username == "" || req.CredentialID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Username and credential ID are required",
		})
		return
	}

	err := h.AuthService.CreateFirstUser(req.Username, req.CredentialID)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": "Failed to create first user: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":  "First user created successfully",
		"username": req.Username,
	})
}

type GenerateInviteTokenRequest struct {
}

type GenerateInviteTokenResponse struct {
	Token     string `json:"token"`
	InviteURL string `json:"invite_url"`
}

func (h *APIHandler) generateInviteToken(c *gin.Context) {
	username, exists := c.Get("authenticated_user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Authentication required",
		})
		return
	}

	token, err := h.AuthService.GenerateInviteToken(username.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to generate invite token: " + err.Error(),
		})
		return
	}

	inviteURL := fmt.Sprintf("%s/setup?invite=%s", h.Config.FrontendURL, token)

	c.JSON(http.StatusCreated, GenerateInviteTokenResponse{
		Token:     token,
		InviteURL: inviteURL,
	})
}

type CreateUserFromInviteRequest struct {
	Token        string `json:"token" binding:"required"`
	Username     string `json:"username" binding:"required"`
	CredentialID string `json:"credential_id" binding:"required"`
}

func (h *APIHandler) createUserFromInvite(c *gin.Context) {
	var req CreateUserFromInviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request body",
		})
		return
	}

	if req.Username == "" || req.CredentialID == "" || req.Token == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Username, credential ID, and token are required",
		})
		return
	}

	err := h.AuthService.CreateUserFromInvite(req.Token, req.Username, req.CredentialID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Failed to create user from invite: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":  "User created successfully from invitation",
		"username": req.Username,
	})
}

type CreateUserRequest struct {
	Username     string `json:"username"`
	IsAdmin      bool   `json:"is_admin"`
	CredentialID string `json:"credential_id"`
}

func (h *APIHandler) createUser(c *gin.Context) {
	// TODO: Add admin authentication middleware
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request body",
		})
		return
	}

	err := h.Services.UserService.CreateUser(req.Username, req.IsAdmin, req.CredentialID)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":  "User created successfully",
		"username": req.Username,
	})
}

func (h *APIHandler) listUsers(c *gin.Context) {
	// TODO: Add admin authentication middleware
	users, err := h.Services.UserService.ListUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"users": users,
	})
}

func (h *APIHandler) deleteUser(c *gin.Context) {
	// TODO: Add admin authentication middleware
	username := c.Param("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Username is required",
		})
		return
	}

	err := h.Services.UserService.DeleteUser(username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "User deleted successfully",
	})
}

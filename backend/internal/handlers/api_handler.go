package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/middleware"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-gonic/gin"
)

type APIHandler struct {
	DocumentService *services.DocumentService
	SearchService   *services.SearchService
	AssetService    *services.AssetService
	LinkService     *services.LinkService
	GitService      *services.GitService
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
		SearchService:   services.SearchService,
		AssetService:    services.AssetService,
		LinkService:     services.LinkService,
		GitService:      services.GitService,
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

		// Administrative endpoints: require an authenticated admin user.
		// Previously these enforced no authorization at all (privilege
		// escalation / unauthenticated user management).
		admin := auth.Group("")
		admin.Use(middleware.RequireAdmin(h.Services.UserService))
		{
			admin.POST("/invite", h.generateInviteToken)
			admin.POST("/users", h.createUser)
			admin.GET("/users", h.listUsers)
			admin.DELETE("/users/:username", h.deleteUser)
		}
	}
	documents := routerGroup.Group("/documents")
	{
		documents.GET("", h.listDocuments)
		documents.POST("", h.createDocument)
		documents.POST("/move", h.moveDocument)
		documents.GET("/*path", h.getDocumentByPath)
		documents.HEAD("/*path", h.checkDocumentExists)
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
		versions.GET("", h.getDocumentVersions)
		versions.GET("/document", h.getDocumentAtVersion)
		versions.GET("/diff", h.compareDocumentVersions)
		versions.POST("/restore", h.restoreDocumentVersion)
	}

	github := routerGroup.Group("/github")
	{
		github.POST("/setup", h.setupGitHub)
		github.POST("/test", h.testGitHubConnection)
		github.GET("/config", h.getGitHubConfig)                      // Non-sensitive config (no secret unlock required)
		github.GET("/connection-status", h.getGitHubConnectionStatus) // Connection status (requires secret unlock)
		github.POST("/sync", h.syncToGitHub)
		github.PUT("/config", h.updateGitHubConfig)
		github.POST("/disconnect", h.disconnectGitHub)

	}

	git := routerGroup.Group("/git")
	{
		git.GET("/health", h.gitHealthCheck)
		git.POST("/repair", h.repairGitRepository)

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
		// Public within the secrets group: lock and status work regardless of lock state.
		secrets.POST("/lock", LockSecretsHandler(h.Services))
		secrets.GET("/status", SecretsStatusHandler(h.Services))

		// Everything below requires the secret store to be unlocked.
		secrets.Use(RequireUnlockedSecrets(h.Services))
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

		// Management endpoints
		passkeys.GET("", ListPasskeysHandler(h.Services))
		passkeys.POST("/unlock", UnlockWithPasskeyHandler(h.Services))
		passkeys.DELETE("/:id", DeletePasskeyHandler(h.Services))
		passkeys.GET("/status", PasskeyStatusHandler(h.Services))
	}

	routerGroup.POST("/import/documents", h.importDocuments)
	routerGroup.GET("/search", h.search)
	routerGroup.GET("/tags", h.getAllTags)
	routerGroup.GET("/templates", h.getTemplates)
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
	limit, _ := strconv.Atoi(c.Query("limit")) // invalid or missing: the default
	results, total, err := h.SearchService.Search(query, limit)
	if err != nil {
		HandleError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"query":   query,
		"results": results,
		"total":   total,
	})
}

func (h *APIHandler) getAllTags(c *gin.Context) {
	tagCounts, err := h.DocumentService.GetAllTags()
	if err != nil {
		HandleError(c, err)
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

func (h *APIHandler) getTemplates(c *gin.Context) {
	templates, err := h.Services.TemplateService.GetTemplates()
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"templates": templates,
		"total":     len(templates),
	})
}

func (h *APIHandler) getDocumentLinks(c *gin.Context) {
	path := pathParam(c)

	links, err := h.LinkService.GetOutgoingLinks(path)
	if err != nil {
		HandleError(c, errors.NewNotFoundError("document", path).WithCause(err))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"path":  path,
		"links": links,
		"total": len(links),
	})
}

func (h *APIHandler) getDocumentBacklinks(c *gin.Context) {
	path := pathParam(c)

	backlinks, err := h.LinkService.GetBacklinks(path)
	if err != nil {
		HandleError(c, errors.NewValidationError(err.Error()).WithCause(err))
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
		HandleError(c, err)
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
		HandleError(c, errors.NewValidationError("Invalid form data: "+err.Error()).WithCause(err))
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		HandleError(c, errors.NewValidationError("No files provided"))
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
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}

type PasskeyLoginRequest struct {
	// AuthTicket is the single-use proof returned by
	// /api/passkeys/authenticate/finish after a verified WebAuthn assertion.
	AuthTicket string `json:"authTicket"`
}

func (h *APIHandler) loginWithPasskey(c *gin.Context) {
	var req PasskeyLoginRequest
	if !bindJSON(c, &req) {
		return
	}

	if req.AuthTicket == "" {
		HandleError(c, errors.NewUnauthorizedError("Authentication failed"))
		return
	}

	// Only a ticket bound to a verified assertion is accepted -- never a bare
	// credential ID.
	response, err := h.AuthService.LoginWithPasskeyTicket(req.AuthTicket)
	if err != nil {
		HandleError(c, err)
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
	username, ok := currentUser(c)
	if !ok {
		HandleError(c, errors.NewUnauthorizedError("Not authenticated"))
		return
	}

	user, err := h.AuthService.GetUser(username)
	if err != nil {
		HandleError(c, err)
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
		HandleError(c, err)
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
	if !bindJSON(c, &req) {
		return
	}

	// CreateFirstUser rejects an empty username or credential (400) and any
	// call once a user exists (409).
	if err := h.AuthService.CreateFirstUser(req.Username, req.CredentialID); err != nil {
		HandleError(c, err)
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
	username, ok := requireUser(c)
	if !ok {
		return
	}

	token, err := h.AuthService.GenerateInviteToken(username)
	if err != nil {
		HandleError(c, err)
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
	if !bindJSON(c, &req) {
		return
	}

	if req.Username == "" || req.CredentialID == "" || req.Token == "" {
		HandleError(c, errors.NewValidationError("Username, credential ID, and token are required"))
		return
	}

	if err := h.AuthService.CreateUserFromInvite(req.Token, req.Username, req.CredentialID); err != nil {
		HandleError(c, err)
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
	// Authorization is enforced by middleware.RequireAdmin on this route group.
	var req CreateUserRequest
	if !bindJSON(c, &req) {
		return
	}

	// Defense in depth: only an admin caller may create another admin. The
	// route is already admin-gated, but verify explicitly so the client-settable
	// is_admin flag can never escalate privileges if the gate is ever relaxed.
	if req.IsAdmin {
		username, ok := requireUser(c)
		if !ok {
			return
		}
		caller, err := h.Services.UserService.GetUserByUsername(username)
		if err != nil || !caller.IsAdmin {
			HandleError(c, errors.NewForbiddenError("Only an administrator may create an admin user"))
			return
		}
	}

	if err := h.Services.UserService.CreateUser(req.Username, req.IsAdmin, req.CredentialID); err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":  "User created successfully",
		"username": req.Username,
	})
}

func (h *APIHandler) listUsers(c *gin.Context) {
	// Authorization is enforced by middleware.RequireAdmin on this route group.
	users, err := h.Services.UserService.ListUsers()
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"users": users,
	})
}

func (h *APIHandler) deleteUser(c *gin.Context) {
	// Authorization is enforced by middleware.RequireAdmin on this route group.
	username, ok := requiredParam(c, "username")
	if !ok {
		return
	}

	if err := h.Services.UserService.DeleteUser(username); err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "User deleted successfully",
	})
}


import (
	"fmt"
	"net/http"
	"strings"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-gonic/gin"
)

func (h *APIHandler) setupGitHub(c *gin.Context) {
	var req services.GitHubSetupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request: " + err.Error(),
		})
		return
	}

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

	config := h.GitHubService.GetGitHubSettings()
	connectionStatus, err := h.GitHubService.GetGitHubConnectionStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Setup completed but failed to get connection status: %v", err),
		})
		return
	}

	status := struct {
		*services.GitHubSettings
		*services.GitHubConnectionStatus
	}{
		GitHubSettings:         config,
		GitHubConnectionStatus: connectionStatus,
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "GitHub repository setup successfully",
		"repository":   repoInfo,
		"status":       status,
		"auto_sync":    req.AutoSync,
		"sync_on_save": req.SyncOnSave,
	})
}

// getGitHubConfig returns non-sensitive GitHub configuration (no secret unlock required)
func (h *APIHandler) getGitHubConfig(c *gin.Context) {
	config := h.GitHubService.GetGitHubSettings()
	c.JSON(http.StatusOK, config)
}

// getGitHubConnectionStatus returns connection status (requires secret unlock)
func (h *APIHandler) getGitHubConnectionStatus(c *gin.Context) {
	status, err := h.GitHubService.GetGitHubConnectionStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to get GitHub connection status: %v", err),
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

	if !result.Success && len(result.Errors) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": result.Errors[0],
		})
		return
	}

	c.JSON(http.StatusOK, result)
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

	config := h.GitHubService.GetGitHubSettings()
	connectionStatus, err := h.GitHubService.GetGitHubConnectionStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Configuration updated but failed to get connection status: %v", err),
		})
		return
	}

	// Return combined response for config update
	status := struct {
		*services.GitHubSettings
		*services.GitHubConnectionStatus
	}{
		GitHubSettings:         config,
		GitHubConnectionStatus: connectionStatus,
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "GitHub configuration updated successfully",
		"status":  status,
	})
}

func (h *APIHandler) testGitHubConnection(c *gin.Context) {
	var req services.GitHubSetupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request: " + err.Error(),
		})
		return
	}

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

	err := h.GitHubService.TestConnection(req.Token, req.Owner, req.Repo, req.Branch)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Connection test failed: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Connection test successful",
	})
}

func (h *APIHandler) gitHealthCheck(c *gin.Context) {
	if h.GitService == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"healthy": false,
			"error":   "Git service is not available",
		})
		return
	}

	if err := h.GitService.HealthCheck(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"healthy": false,
			"error":   fmt.Sprintf("Git repository health check failed: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"healthy": true,
		"message": "Git repository is healthy",
	})
}

func (h *APIHandler) repairGitRepository(c *gin.Context) {
	if h.GitService == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Git service is not available",
		})
		return
	}

	if err := h.GitService.RepairRepository(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Repository repair failed: %v", err),
		})
		return
	}

	if err := h.GitService.HealthCheck(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Repository repair completed but health check still failed: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Repository repair completed successfully",
	})
}

func (h *APIHandler) disconnectGitHub(c *gin.Context) {
	if err := h.GitHubService.Disconnect(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to disconnect GitHub integration: %v", err),
		})
		return
	}

	config := h.GitHubService.GetGitHubSettings()
	connectionStatus := &services.GitHubConnectionStatus{
		TokenExists:    false,
		Connected:      false,
		PendingChanges: 0,
	}

	status := struct {
		*services.GitHubSettings
		*services.GitHubConnectionStatus
	}{
		GitHubSettings:         config,
		GitHubConnectionStatus: connectionStatus,
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "GitHub integration disconnected successfully",
		"status":  status,
	})
}

func (h *APIHandler) getDocsRepositories(c *gin.Context) {
	repos, err := h.GitHubService.GetDocsRepositories()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to get docs repositories: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"repositories": repos,
	})
}

func (h *APIHandler) addDocsRepository(c *gin.Context) {
	var req models.GitHubDocsRepoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request: " + err.Error(),
		})
		return
	}

	if strings.TrimSpace(req.Owner) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository owner is required",
		})
		return
	}

	if strings.TrimSpace(req.Repository) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository name is required",
		})
		return
	}

	err := h.GitHubService.AddDocsRepository(req.Owner, req.Repository, req.DocsFolder, req.Branch)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Failed to add docs repository: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Repository added successfully",
	})
}

func (h *APIHandler) removeDocsRepository(c *gin.Context) {
	owner := c.Param("owner")
	repo := c.Param("repo")

	if strings.TrimSpace(owner) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository owner is required",
		})
		return
	}

	if strings.TrimSpace(repo) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository name is required",
		})
		return
	}

	err := h.GitHubService.RemoveDocsRepository(owner, repo)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Failed to remove docs repository: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Repository removed successfully",
	})
}

func (h *APIHandler) getRepositoryStructure(c *gin.Context) {
	owner := c.Query("owner")
	repo := c.Query("repo")
	path := c.Query("path")

	if strings.TrimSpace(owner) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository owner is required",
		})
		return
	}

	if strings.TrimSpace(repo) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository name is required",
		})
		return
	}

	structure, err := h.GitHubService.GetRepositoryStructure(owner, repo, path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to get repository structure: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, structure)
}

func (h *APIHandler) getDocumentContent(c *gin.Context) {
	owner := c.Query("owner")
	repo := c.Query("repo")
	path := c.Query("path")

	if strings.TrimSpace(owner) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository owner is required",
		})
		return
	}

	if strings.TrimSpace(repo) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository name is required",
		})
		return
	}

	if strings.TrimSpace(path) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Document path is required",
		})
		return
	}

	document, err := h.GitHubService.GetDocumentContent(owner, repo, path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to get document content: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, document)
}

func (h *APIHandler) listDocsFiles(c *gin.Context) {
	owner := c.Query("owner")
	repo := c.Query("repo")

	if strings.TrimSpace(owner) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository owner is required",
		})
		return
	}

	if strings.TrimSpace(repo) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository name is required",
		})
		return
	}

	files, err := h.GitHubService.ListDocsFiles(owner, repo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to list docs files: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"files": files,
	})
}

func (h *APIHandler) syncDocsRepository(c *gin.Context) {
	owner := c.Param("owner")
	repo := c.Param("repo")

	if strings.TrimSpace(owner) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository owner is required",
		})
		return
	}

	if strings.TrimSpace(repo) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Repository name is required",
		})
		return
	}

	err := h.GitHubService.SyncDocsRepository(owner, repo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to sync repository: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Repository synced successfully",
	})
}

func (h *APIHandler) syncAllDocsRepositories(c *gin.Context) {
	results, err := h.GitHubService.SyncAllDocsRepositories()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to sync repositories: %v", err),
		})
		return
	}

	successCount := 0
	failureCount := 0
	var failures []string

	for repo, syncErr := range results {
		if syncErr == nil {
			successCount++
		} else {
			failureCount++
			failures = append(failures, fmt.Sprintf("%s: %v", repo, syncErr))
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       "Sync completed",
		"success_count": successCount,
		"failure_count": failureCount,
		"failures":      failures,
	})
}

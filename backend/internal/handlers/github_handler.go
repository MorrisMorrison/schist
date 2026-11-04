package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-gonic/gin"
)

// gitHubStatus is the combined settings + connection-status payload returned by
// the GitHub setup/config/disconnect endpoints.
type gitHubStatus struct {
	*services.GitHubSettings
	*services.GitHubConnectionStatus
}

func newGitHubStatus(settings *services.GitHubSettings, conn *services.GitHubConnectionStatus) gitHubStatus {
	return gitHubStatus{GitHubSettings: settings, GitHubConnectionStatus: conn}
}

// validateGitHubRepoRequest checks the required token/owner/repo fields shared by
// the setup and test-connection endpoints.
func validateGitHubRepoRequest(req *services.GitHubSetupRequest) *errors.APIError {
	if strings.TrimSpace(req.Token) == "" {
		return errors.NewValidationError("GitHub token is required")
	}
	if strings.TrimSpace(req.Owner) == "" {
		return errors.NewValidationError("Repository owner is required")
	}
	if strings.TrimSpace(req.Repo) == "" {
		return errors.NewValidationError("Repository name is required")
	}
	return nil
}

func (h *APIHandler) setupGitHub(c *gin.Context) {
	var req services.GitHubSetupRequest
	if !bindJSON(c, &req) {
		return
	}

	if apiErr := validateGitHubRepoRequest(&req); apiErr != nil {
		HandleError(c, apiErr)
		return
	}

	repoInfo, err := h.GitHubService.SetupRepository(&req)
	if err != nil {
		HandleError(c, err)
		return
	}

	config := h.GitHubService.GetGitHubSettings()
	connectionStatus, err := h.GitHubService.GetGitHubConnectionStatus()
	if err != nil {
		HandleError(c, err)
		return
	}

	status := newGitHubStatus(config, connectionStatus)

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
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, status)
}

// syncToGitHub pushes the wiki now. An optional body {"replace_remote": true}
// replaces a diverged GitHub branch; the UI sends it only after the user
// confirms, in answer to a SYNC_REMOTE_DIVERGED error.
func (h *APIHandler) syncToGitHub(c *gin.Context) {
	var opts services.GitHubSyncOptions
	if c.Request.ContentLength != 0 {
		if !bindJSON(c, &opts) {
			return
		}
	}

	result, err := h.GitHubService.Sync(opts)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}

// previewGitHubSync shows what a two-way sync would do, changing nothing.
func (h *APIHandler) previewGitHubSync(c *gin.Context) {
	preview, err := h.GitHubService.PreviewSync()
	if err != nil {
		HandleError(c, err)
		return
	}
	c.JSON(http.StatusOK, preview)
}

// getGitHubSyncConflict returns both versions of a page a paused sync waits on.
func (h *APIHandler) getGitHubSyncConflict(c *gin.Context) {
	versions, err := h.GitHubService.ConflictVersions(c.Query("path"))
	if err != nil {
		HandleError(c, err)
		return
	}
	c.JSON(http.StatusOK, versions)
}

func (h *APIHandler) updateGitHubConfig(c *gin.Context) {
	var req services.GitHubConfigRequest
	if !bindJSON(c, &req) {
		return
	}

	if err := h.GitHubService.UpdateConfiguration(&req); err != nil {
		HandleError(c, err)
		return
	}

	config := h.GitHubService.GetGitHubSettings()
	connectionStatus, err := h.GitHubService.GetGitHubConnectionStatus()
	if err != nil {
		HandleError(c, err)
		return
	}

	// Return combined response for config update
	status := newGitHubStatus(config, connectionStatus)

	c.JSON(http.StatusOK, gin.H{
		"message": "GitHub configuration updated successfully",
		"status":  status,
	})
}

func (h *APIHandler) testGitHubConnection(c *gin.Context) {
	var req services.GitHubSetupRequest
	if !bindJSON(c, &req) {
		return
	}

	if apiErr := validateGitHubRepoRequest(&req); apiErr != nil {
		HandleError(c, apiErr)
		return
	}

	result, err := h.GitHubService.TestConnection(req.Token, req.Owner, req.Repo, req.Branch)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"message":       result.Message,
		"branch":        result.Branch,
		"branch_exists": result.BranchExists,
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
		HandleError(c, err)
		return
	}

	config := h.GitHubService.GetGitHubSettings()
	connectionStatus := &services.GitHubConnectionStatus{
		TokenExists:    false,
		Connected:      false,
		PendingChanges: 0,
	}

	status := newGitHubStatus(config, connectionStatus)

	c.JSON(http.StatusOK, gin.H{
		"message": "GitHub integration disconnected successfully",
		"status":  status,
	})
}

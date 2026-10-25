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
		HandleError(c, errors.NewValidationError(fmt.Sprintf("Failed to setup GitHub repository: %v", err)).WithCause(err))
		return
	}

	config := h.GitHubService.GetGitHubSettings()
	connectionStatus, err := h.GitHubService.GetGitHubConnectionStatus()
	if err != nil {
		HandleError(c, errors.NewInternalError(fmt.Sprintf("Setup completed but failed to get connection status: %v", err)).WithCause(err))
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
		HandleError(c, errors.NewInternalError(fmt.Sprintf("Failed to get GitHub connection status: %v", err)).WithCause(err))
		return
	}

	c.JSON(http.StatusOK, status)
}

func (h *APIHandler) syncToGitHub(c *gin.Context) {
	if !h.GitHubService.IsEnabled() {
		HandleError(c, errors.NewValidationError("GitHub integration is not enabled"))
		return
	}

	result, err := h.GitHubService.SyncToGitHub()
	if err != nil {
		HandleError(c, errors.NewInternalError(fmt.Sprintf("Sync failed: %v", err)).WithCause(err))
		return
	}

	if !result.Success && len(result.Errors) > 0 {
		HandleError(c, errors.NewValidationError(result.Errors[0]))
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *APIHandler) updateGitHubConfig(c *gin.Context) {
	if !h.GitHubService.IsEnabled() {
		HandleError(c, errors.NewValidationError("GitHub integration is not enabled"))
		return
	}

	var req services.GitHubConfigRequest
	if !bindJSON(c, &req) {
		return
	}

	if err := h.GitHubService.UpdateConfiguration(&req); err != nil {
		HandleError(c, errors.NewValidationError(fmt.Sprintf("Failed to update configuration: %v", err)).WithCause(err))
		return
	}

	config := h.GitHubService.GetGitHubSettings()
	connectionStatus, err := h.GitHubService.GetGitHubConnectionStatus()
	if err != nil {
		HandleError(c, errors.NewInternalError(fmt.Sprintf("Configuration updated but failed to get connection status: %v", err)).WithCause(err))
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

	err := h.GitHubService.TestConnection(req.Token, req.Owner, req.Repo, req.Branch)
	if err != nil {
		// Domain response: the frontend reads the success flag on this endpoint.
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
		HandleError(c, errors.NewInternalError(fmt.Sprintf("Failed to disconnect GitHub integration: %v", err)).WithCause(err))
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

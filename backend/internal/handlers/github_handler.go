package handlers

import (
	"fmt"
	"net/http"
	"strings"

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

	status, err := h.GitHubService.GetSyncStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Setup completed but failed to get status: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "GitHub repository setup successfully",
		"repository":   repoInfo,
		"status":       status,
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

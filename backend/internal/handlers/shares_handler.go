package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type CreateShareRequest struct {
	DocumentPath string `json:"document_path" binding:"required"`
	ExpiryDays   int    `json:"expiry_days"`
}

type ShareResponse struct {
	ID           string `json:"id"`
	DocumentPath string `json:"document_path"`
	Token        string `json:"token"`
	ShareURL     string `json:"share_url"`
	CreatedAt    string `json:"created_at"`
	ExpiresAt    string `json:"expires_at"`
	CreatedBy    string `json:"created_by"`
}

func (h *APIHandler) createShare(c *gin.Context) {
	var req CreateShareRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request body: " + err.Error(),
		})
		return
	}

	// Get authenticated user
	username, exists := c.Get("authenticated_user")
	if !exists {
		username = "anonymous"
	}

	// Use requested expiry days (ShareService will apply defaults and limits)
	expiryDays := req.ExpiryDays

	share, err := h.ShareService.CreateShare(req.DocumentPath, username.(string), expiryDays)
	if err != nil {
		if err.Error() == "document not found: document not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Document not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create share: " + err.Error(),
		})
		return
	}

	// Build share URL using frontend URL from config
	shareURL := h.Config.FrontendURL + "/share/" + share.Token

	response := ShareResponse{
		ID:           share.ID,
		DocumentPath: share.DocumentPath,
		Token:        share.Token,
		ShareURL:     shareURL,
		CreatedAt:    share.CreatedAt.Format("2006-01-02T15:04:05Z"),
		ExpiresAt:    share.ExpiresAt.Format("2006-01-02T15:04:05Z"),
		CreatedBy:    share.CreatedBy,
	}

	c.JSON(http.StatusCreated, response)
}

func (h *APIHandler) getSharedDocument(c *gin.Context) {
	token := c.Param("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Token is required",
		})
		return
	}

	document, err := h.ShareService.GetSharedDocument(token)
	if err != nil {
		if err.Error() == "share not found" || err.Error() == "share has expired" {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Share not found or expired",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to get shared document: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, document)
}

func (h *APIHandler) listShares(c *gin.Context) {
	username := "anonymous"
	if h.Config.AuthEnabled {
		var exists bool
		userVal, exists := c.Get("authenticated_user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required",
			})
			return
		}
		username, _ = userVal.(string)
	}

	shares, err := h.ShareService.ListShares(username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to list shares: " + err.Error(),
		})
		return
	}

	// Convert to response format
	var responses []ShareResponse
	for _, share := range shares {
		// Build share URL using frontend URL from config
		shareURL := h.Config.FrontendURL + "/share/" + share.Token

		responses = append(responses, ShareResponse{
			ID:           share.ID,
			DocumentPath: share.DocumentPath,
			Token:        share.Token,
			ShareURL:     shareURL,
			CreatedAt:    share.CreatedAt.Format("2006-01-02T15:04:05Z"),
			ExpiresAt:    share.ExpiresAt.Format("2006-01-02T15:04:05Z"),
			CreatedBy:    share.CreatedBy,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"shares": responses,
		"total":  len(responses),
	})
}

func (h *APIHandler) revokeShare(c *gin.Context) {
	shareID := c.Param("id")
	if shareID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Share ID is required",
		})
		return
	}

	username := "anonymous"
	if h.Config.AuthEnabled {
		var exists bool
		userVal, exists := c.Get("authenticated_user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required",
			})
			return
		}
		username, _ = userVal.(string)
	}

	err := h.ShareService.RevokeShare(shareID, username)
	if err != nil {
		if err.Error() == "share not found or not owned by user" {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Share not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to revoke share: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Share revoked successfully",
	})
}

func (h *APIHandler) cleanupExpiredShares(c *gin.Context) {
	err := h.ShareService.CleanupExpiredShares()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to cleanup expired shares: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Expired shares cleaned up successfully",
	})
}

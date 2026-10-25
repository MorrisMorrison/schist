package handlers

import (
	"net/http"

	"github.com/MorrisMorrison/schist/internal/services"
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

func (h *APIHandler) toShareResponse(share services.ShareToken) ShareResponse {
	return ShareResponse{
		ID:           share.ID,
		DocumentPath: share.DocumentPath,
		Token:        share.Token,
		ShareURL:     h.Config.FrontendURL + "/share/" + share.Token,
		CreatedAt:    share.CreatedAt.Format(apiTimeFormat),
		ExpiresAt:    share.ExpiresAt.Format(apiTimeFormat),
		CreatedBy:    share.CreatedBy,
	}
}

// shareOwner returns whose shares the request manages: the signed-in user, or
// "anonymous" when auth is disabled.
func (h *APIHandler) shareOwner(c *gin.Context) (string, bool) {
	if !h.Config.AuthEnabled {
		return "anonymous", true
	}
	return requireUser(c)
}

func (h *APIHandler) createShare(c *gin.Context) {
	var req CreateShareRequest
	if !bindJSON(c, &req) {
		return
	}

	username, ok := currentUser(c)
	if !ok {
		username = "anonymous"
	}

	// Use requested expiry days (ShareService will apply defaults and limits)
	share, err := h.ShareService.CreateShare(req.DocumentPath, username, req.ExpiryDays)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusCreated, h.toShareResponse(*share))
}

func (h *APIHandler) getSharedDocument(c *gin.Context) {
	token, ok := requiredParam(c, "token")
	if !ok {
		return
	}

	document, err := h.ShareService.GetSharedDocument(token)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, document)
}

func (h *APIHandler) listShares(c *gin.Context) {
	username, ok := h.shareOwner(c)
	if !ok {
		return
	}

	shares, err := h.ShareService.ListShares(username)
	if err != nil {
		HandleError(c, err)
		return
	}

	responses := make([]ShareResponse, 0, len(shares))
	for _, share := range shares {
		responses = append(responses, h.toShareResponse(share))
	}

	c.JSON(http.StatusOK, gin.H{
		"shares": responses,
		"total":  len(responses),
	})
}

func (h *APIHandler) revokeShare(c *gin.Context) {
	shareID, ok := requiredParam(c, "id")
	if !ok {
		return
	}

	username, ok := h.shareOwner(c)
	if !ok {
		return
	}

	err := h.ShareService.RevokeShare(shareID, username)
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Share revoked successfully",
	})
}

func (h *APIHandler) cleanupExpiredShares(c *gin.Context) {
	err := h.ShareService.CleanupExpiredShares()
	if err != nil {
		HandleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Expired shares cleaned up successfully",
	})
}

package handlers

import (
	"net/http"

	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/gin-gonic/gin"
)

// Personal access tokens are managed with a signed-in session only: the auth
// middleware keeps token-authenticated requests away from /api/tokens, so a
// token can't mint or revoke tokens.

// tokenUser returns the signed-in user, or responds with an error when auth
// is disabled (there are no users to own tokens) or nobody is signed in.
func (h *APIHandler) tokenUser(c *gin.Context) (string, bool) {
	if !h.Config.AuthEnabled {
		HandleError(c, errors.NewInvalidStateError("Personal access tokens need authentication to be enabled"))
		return "", false
	}
	return requireUser(c)
}

func (h *APIHandler) listTokens(c *gin.Context) {
	username, ok := h.tokenUser(c)
	if !ok {
		return
	}
	tokens, err := h.Services.TokenService.List(username)
	if err != nil {
		HandleError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"tokens": tokens, "total": len(tokens)})
}

func (h *APIHandler) createToken(c *gin.Context) {
	username, ok := h.tokenUser(c)
	if !ok {
		return
	}
	var req struct {
		Name          string `json:"name"`
		Scope         string `json:"scope"`
		ExpiresInDays int    `json:"expires_in_days"`
	}
	if !bindJSON(c, &req) {
		return
	}

	raw, token, err := h.Services.TokenService.Create(username, req.Name, req.Scope, req.ExpiresInDays)
	if err != nil {
		HandleError(c, err)
		return
	}
	// The raw token is returned this once and never stored.
	c.JSON(http.StatusCreated, gin.H{"token": raw, "info": token})
}

func (h *APIHandler) revokeToken(c *gin.Context) {
	username, ok := h.tokenUser(c)
	if !ok {
		return
	}
	if err := h.Services.TokenService.Revoke(username, c.Param("id")); err != nil {
		HandleError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

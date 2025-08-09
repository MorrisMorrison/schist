package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/MorrisMorrison/schist/internal/services"
)

// WebAuthn Registration Types
type BeginRegistrationRequest struct {
	Name string `json:"name" binding:"required"`
}

type BeginRegistrationResponse struct {
	Options   *protocol.CredentialCreation `json:"options"`
	SessionID string                       `json:"sessionId"`
}

type FinishRegistrationRequest struct {
	Name      string          `json:"name" binding:"required"`
	SessionID string          `json:"sessionId" binding:"required"`
	Response  json.RawMessage `json:"response" binding:"required"`
}

type FinishRegistrationResponse struct {
	CredentialID string `json:"credentialId"`
	Message      string `json:"message"`
}

// WebAuthn Authentication Types
type BeginAuthenticationResponse struct {
	Options   *protocol.CredentialAssertion `json:"options"`
	SessionID string                        `json:"sessionId"`
}

type FinishAuthenticationRequest struct {
	SessionID string          `json:"sessionId" binding:"required"`
	Response  json.RawMessage `json:"response" binding:"required"`
}

type FinishAuthenticationResponse struct {
	CredentialID string `json:"credentialId"`
	Message      string `json:"message"`
}

// Legacy Types (for compatibility with existing frontend)
type UnlockWithPasskeyRequest struct {
	CredentialID string `json:"credentialId" binding:"required"`
}

type PasskeyInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type PasskeyListResponse struct {
	Passkeys []PasskeyInfo `json:"passkeys"`
}

type PasskeyStatusResponse struct {
	HasPasskeys      bool `json:"hasPasskeys"`
	IsUnlocked       bool `json:"isUnlocked"`
	RequiresPassword bool `json:"requiresPassword"`
}

// Session storage for WebAuthn sessions
// TODO: In production, use Redis or proper session store
var sessionStore = make(map[string]*webauthn.SessionData)

// WebAuthn handlers
func BeginPasskeyRegistrationHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req BeginRegistrationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		options, session, err := services.PasskeyService.BeginRegistration(req.Name)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Generate a session ID and store the session
		sessionID := generateSessionID()
		sessionStore[sessionID] = session

		response := BeginRegistrationResponse{
			Options:   options,
			SessionID: sessionID,
		}

		c.JSON(http.StatusOK, response)
	}
}

func FinishPasskeyRegistrationHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req FinishRegistrationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Retrieve the session
		session, exists := sessionStore[req.SessionID]
		if !exists {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired session"})
			return
		}

		// Clean up the session
		delete(sessionStore, req.SessionID)

		// Parse the WebAuthn response
		parsedResponse, err := protocol.ParseCredentialCreationResponseBody(bytes.NewReader(req.Response))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid WebAuthn response"})
			return
		}

		credentialID, err := services.PasskeyService.FinishRegistration(req.Name, session, parsedResponse)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		response := FinishRegistrationResponse{
			CredentialID: credentialID,
			Message:      "Passkey registered successfully",
		}

		c.JSON(http.StatusCreated, response)
	}
}

func BeginPasskeyAuthenticationHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		options, session, err := services.PasskeyService.BeginAuthentication()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Generate a session ID and store the session
		sessionID := generateSessionID()
		sessionStore[sessionID] = session

		response := BeginAuthenticationResponse{
			Options:   options,
			SessionID: sessionID,
		}

		c.JSON(http.StatusOK, response)
	}
}

func FinishPasskeyAuthenticationHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req FinishAuthenticationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Retrieve the session
		session, exists := sessionStore[req.SessionID]
		if !exists {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired session"})
			return
		}

		// Clean up the session
		delete(sessionStore, req.SessionID)

		// Parse the WebAuthn response
		parsedResponse, err := protocol.ParseCredentialRequestResponseBody(bytes.NewReader(req.Response))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid WebAuthn response"})
			return
		}

		credentialID, err := services.PasskeyService.FinishAuthentication(session, parsedResponse)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		response := FinishAuthenticationResponse{
			CredentialID: credentialID,
			Message:      "Authentication successful",
		}

		c.JSON(http.StatusOK, response)
	}
}

// Legacy compatibility handlers
func CreatePasskeyHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Passkey creation now requires WebAuthn flow. " +
				"Use /api/passkeys/register/begin and /api/passkeys/register/finish endpoints.",
		})
	}
}

func ListPasskeysHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		credentials, err := services.PasskeyService.ListCredentials()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		passkeys := make([]PasskeyInfo, len(credentials))
		for i, cred := range credentials {
			passkeys[i] = PasskeyInfo{
				ID:        cred.ID,
				Name:      cred.Name,
				CreatedAt: cred.CreatedAt.Format("2006-01-02T15:04:05Z"),
			}
		}

		response := PasskeyListResponse{
			Passkeys: passkeys,
		}

		c.JSON(http.StatusOK, response)
	}
}

func UnlockWithPasskeyHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req UnlockWithPasskeyRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		err := services.SecretManager.UnlockWithPasskey(req.CredentialID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to unlock with passkey: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Secret store unlocked successfully"})
	}
}

func DeletePasskeyHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		credentialID := c.Param("id")
		if credentialID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Credential ID is required"})
			return
		}

		err := services.PasskeyService.DeleteCredential(credentialID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Passkey not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Passkey deleted successfully"})
	}
}

func PasskeyStatusHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		hasPasskeys, err := services.PasskeyService.HasCredentials()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		status := PasskeyStatusResponse{
			HasPasskeys:      hasPasskeys,
			IsUnlocked:       services.SecretManager.IsUnlocked(),
			RequiresPassword: services.SecretManager.RequiresPassword(),
		}

		c.JSON(http.StatusOK, status)
	}
}

// generateSessionID generates a simple session ID
// TODO: Use crypto/rand for production
func generateSessionID() string {
	challenge, _ := protocol.CreateChallenge()
	return "session_" + challenge.String()
}

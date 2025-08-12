package handlers

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"slices"

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

// Types for remaining passkey handlers
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

func ListPasskeysHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		username, exists := c.Get("authenticated_user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			return
		}

		user, err := services.UserService.GetUserByUsername(username.(string))
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		credentials, err := services.PasskeyService.ListCredentials()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var userPasskeys []PasskeyInfo
		for _, cred := range credentials {
			if slices.Contains(user.PasskeyIDs, cred.ID) {
				userPasskeys = append(userPasskeys, PasskeyInfo{
					ID:        cred.ID,
					Name:      cred.Name,
					CreatedAt: cred.CreatedAt.Format("2006-01-02T15:04:05Z"),
				})
			}
		}

		response := PasskeyListResponse{
			Passkeys: userPasskeys,
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

		username, exists := c.Get("authenticated_user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			return
		}

		user, err := services.UserService.GetUserByUsername(username.(string))
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		if !slices.Contains(user.PasskeyIDs, credentialID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete your own passkeys"})
			return
		}

		err = services.PasskeyService.DeleteCredential(credentialID)
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

// generateSessionID generates a cryptographically secure session ID
func generateSessionID() string {
	bytes := make([]byte, 32) // 32 bytes = 256 bits of entropy
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to WebAuthn challenge if crypto/rand fails
		challenge, _ := protocol.CreateChallenge()
		return "session_" + challenge.String()
	}
	return "session_" + base64.RawURLEncoding.EncodeToString(bytes)
}

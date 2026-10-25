package handlers

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"slices"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/MorrisMorrison/schist/internal/errors"
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
	// AuthTicket is a short-lived, single-use proof of the verified assertion.
	// It is exchanged for a JWT at POST /api/auth/login/passkey. A bare
	// credential ID is never accepted as proof of authentication.
	AuthTicket string `json:"authTicket"`
}

// Types for remaining passkey handlers
type UnlockWithPasskeyRequest struct {
	// AuthTicket comes from POST /api/passkeys/authenticate/finish, i.e. a
	// verified WebAuthn assertion. A bare credential ID is not accepted.
	AuthTicket string `json:"authTicket" binding:"required"`
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

// webauthnSessionTTL bounds how long a pending WebAuthn registration or
// authentication session lives before it is evicted.
const webauthnSessionTTL = 5 * time.Minute

// webauthnSessionEntry is a stored session plus the time it was created, used
// for TTL eviction.
type webauthnSessionEntry struct {
	data      *webauthn.SessionData
	createdAt time.Time
}

// sessionStoreT is a concurrency-safe, TTL-bounded store for pending WebAuthn
// sessions. It replaces the previous bare map, which was read/written from
// concurrent handlers without synchronization (concurrent-map panic -> DoS) and
// never expired (memory leak).
//
// TODO: In production, use Redis or a proper shared session store.
type sessionStoreT struct {
	mu       sync.Mutex
	sessions map[string]webauthnSessionEntry
}

var sessionStore = &sessionStoreT{
	sessions: make(map[string]webauthnSessionEntry),
}

// pruneLocked removes expired sessions. Caller must hold mu.
func (s *sessionStoreT) pruneLocked() {
	now := time.Now()
	for id, entry := range s.sessions {
		if now.Sub(entry.createdAt) > webauthnSessionTTL {
			delete(s.sessions, id)
		}
	}
}

// Put stores a session under the given id.
func (s *sessionStoreT) Put(id string, data *webauthn.SessionData) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLocked()
	s.sessions[id] = webauthnSessionEntry{data: data, createdAt: time.Now()}
}

// Take retrieves and removes a session, returning false if it is missing or
// expired. Sessions are single-use.
func (s *sessionStoreT) Take(id string) (*webauthn.SessionData, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLocked()
	entry, ok := s.sessions[id]
	if !ok {
		return nil, false
	}
	delete(s.sessions, id)
	if time.Since(entry.createdAt) > webauthnSessionTTL {
		return nil, false
	}
	return entry.data, true
}

// WebAuthn handlers
func BeginPasskeyRegistrationHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req BeginRegistrationRequest
		if apiErr := ValidateJSONBody(c, &req); apiErr != nil {
			HandleError(c, apiErr)
			return
		}

		if apiErr := authorizePasskeyRegistration(c, services); apiErr != nil {
			HandleError(c, apiErr)
			return
		}

		options, session, err := services.PasskeyService.BeginRegistration(req.Name)
		if err != nil {
			HandleError(c, err)
			return
		}

		// Generate a session ID and store the session
		sessionID := generateSessionID()
		sessionStore.Put(sessionID, session)

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
		if apiErr := ValidateJSONBody(c, &req); apiErr != nil {
			HandleError(c, apiErr)
			return
		}

		if apiErr := authorizePasskeyRegistration(c, services); apiErr != nil {
			HandleError(c, apiErr)
			return
		}

		// Retrieve the session (single-use, TTL-bounded)
		session, exists := sessionStore.Take(req.SessionID)
		if !exists {
			HandleError(c, errors.NewValidationError("invalid or expired session"))
			return
		}

		// Parse the WebAuthn response
		parsedResponse, err := protocol.ParseCredentialCreationResponseBody(bytes.NewReader(req.Response))
		if err != nil {
			HandleError(c, errors.NewValidationError("invalid WebAuthn response"))
			return
		}

		credentialID, err := services.PasskeyService.FinishRegistration(req.Name, session, parsedResponse)
		if err != nil {
			HandleError(c, err)
			return
		}

		// A signed-in user is adding a passkey to their own account: bind it
		// to them so it can be listed, deleted and used to sign in. During
		// first-time setup there is no user yet; setup/first-user binds it.
		if username, ok := currentUser(c); ok {
			if err := services.UserService.AddPasskeyToUser(username, credentialID); err != nil {
				HandleError(c, err)
				return
			}
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
			HandleError(c, err)
			return
		}

		// Generate a session ID and store the session
		sessionID := generateSessionID()
		sessionStore.Put(sessionID, session)

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
		if apiErr := ValidateJSONBody(c, &req); apiErr != nil {
			HandleError(c, apiErr)
			return
		}

		// Retrieve the session (single-use, TTL-bounded)
		session, exists := sessionStore.Take(req.SessionID)
		if !exists {
			HandleError(c, errors.NewValidationError("invalid or expired session"))
			return
		}

		// Parse the WebAuthn response
		parsedResponse, err := protocol.ParseCredentialRequestResponseBody(bytes.NewReader(req.Response))
		if err != nil {
			HandleError(c, errors.NewValidationError("invalid WebAuthn response"))
			return
		}

		credentialID, err := services.PasskeyService.FinishAuthentication(session, parsedResponse)
		if err != nil {
			HandleError(c, err)
			return
		}

		// Only now -- after a verified WebAuthn assertion -- mint a single-use
		// ticket that can be exchanged for a JWT. The bare credential ID is
		// never sufficient on its own.
		ticket, err := services.AuthService.IssueAuthTicket(credentialID)
		if err != nil {
			HandleError(c, errors.NewUnauthorizedError("Authentication failed").WithCause(err))
			return
		}

		response := FinishAuthenticationResponse{
			CredentialID: credentialID,
			Message:      "Authentication successful",
			AuthTicket:   ticket,
		}

		c.JSON(http.StatusOK, response)
	}
}

func ListPasskeysHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		username, ok := currentUser(c)
		if !ok {
			HandleError(c, errors.NewUnauthorizedError("Authentication required"))
			return
		}

		user, err := services.UserService.GetUserByUsername(username)
		if err != nil {
			HandleError(c, errors.NewNotFoundError("user", username).WithCause(err))
			return
		}

		credentials, err := services.PasskeyService.ListCredentials()
		if err != nil {
			HandleError(c, err)
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
		if apiErr := ValidateJSONBody(c, &req); apiErr != nil {
			HandleError(c, apiErr)
			return
		}

		username, _ := currentUser(c)
		credentialID, err := services.AuthService.RedeemAuthTicket(req.AuthTicket, username)
		if err != nil {
			HandleError(c, err)
			return
		}

		err = services.SecretManager.UnlockWithPasskey(credentialID)
		if err != nil {
			if errors.IsAPIError(err) {
				HandleError(c, err)
			} else {
				HandleError(c, errors.NewUnauthorizedError("Failed to unlock with passkey").WithCause(err))
			}
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Secret store unlocked successfully"})
	}
}

func DeletePasskeyHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		credentialID := c.Param("id")
		if credentialID == "" {
			HandleError(c, errors.NewMissingRequiredFieldError("id"))
			return
		}

		username, ok := currentUser(c)
		if !ok {
			HandleError(c, errors.NewUnauthorizedError("Authentication required"))
			return
		}

		user, err := services.UserService.GetUserByUsername(username)
		if err != nil {
			HandleError(c, errors.NewNotFoundError("user", username).WithCause(err))
			return
		}

		if !slices.Contains(user.PasskeyIDs, credentialID) {
			HandleError(c, errors.NewForbiddenError("You can only delete your own passkeys"))
			return
		}

		err = services.PasskeyService.DeleteCredential(credentialID)
		if err != nil {
			HandleError(c, err)
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Passkey deleted successfully"})
	}
}

func PasskeyStatusHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		hasPasskeys, err := services.PasskeyService.HasCredentials()
		if err != nil {
			HandleError(c, err)
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

// authorizePasskeyRegistration gates passkey registration. In this single-user
// model, an unauthenticated visitor may only register a credential during
// first-time setup (when no users exist yet). Once a user exists, registration
// requires an authenticated session -- otherwise any visitor could enroll a
// credential on the existing account (account takeover).
func authorizePasskeyRegistration(c *gin.Context, services *services.Services) *errors.APIError {
	// An authenticated request is always allowed (e.g. adding another passkey
	// to your own account). The auth middleware sets authenticated_user.
	if _, ok := currentUser(c); ok {
		return nil
	}

	// Otherwise, only permit registration during first-time setup.
	isFirstSetup, err := services.AuthService.IsFirstSetup()
	if err != nil {
		return errors.NewInternalError("Failed to check setup status").WithCause(err)
	}
	if isFirstSetup {
		return nil
	}

	return errors.NewUnauthorizedError("Passkey registration requires authentication")
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

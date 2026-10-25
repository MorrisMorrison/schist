package services

import (
	"testing"

	"github.com/MorrisMorrison/schist/internal/config"
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuthService_RedeemAuthTicket(t *testing.T) {
	userService := NewUserService(t.TempDir())
	authService := NewAuthService(&config.Config{JWTSecret: "test-secret", JWTExpiryHours: 24}, userService)
	require.NoError(t, userService.CreateFirstUser("alice", "cred-alice"))

	t.Run("a verified ticket yields its credential", func(t *testing.T) {
		ticket, err := authService.IssueAuthTicket("cred-alice")
		require.NoError(t, err)

		credentialID, err := authService.RedeemAuthTicket(ticket, "alice")
		require.NoError(t, err)
		assert.Equal(t, "cred-alice", credentialID)
	})

	t.Run("tickets are single-use", func(t *testing.T) {
		ticket, err := authService.IssueAuthTicket("cred-alice")
		require.NoError(t, err)
		_, err = authService.RedeemAuthTicket(ticket, "alice")
		require.NoError(t, err)

		_, err = authService.RedeemAuthTicket(ticket, "alice")
		assertAPIStatus(t, err, 401)
	})

	t.Run("a bare credential ID is not a ticket", func(t *testing.T) {
		_, err := authService.RedeemAuthTicket("cred-alice", "alice")
		assertAPIStatus(t, err, 401)
	})

	t.Run("an empty ticket is rejected", func(t *testing.T) {
		_, err := authService.RedeemAuthTicket("", "alice")
		assertAPIStatus(t, err, 401)
	})

	t.Run("a ticket for another user's passkey is refused", func(t *testing.T) {
		ticket, err := authService.IssueAuthTicket("cred-alice")
		require.NoError(t, err)

		_, err = authService.RedeemAuthTicket(ticket, "mallory")
		assertAPIStatus(t, err, 403)
	})

	t.Run("without an authenticated user any verified ticket is accepted", func(t *testing.T) {
		// Auth disabled: there is no session user to compare against.
		ticket, err := authService.IssueAuthTicket("cred-alice")
		require.NoError(t, err)

		credentialID, err := authService.RedeemAuthTicket(ticket, "")
		require.NoError(t, err)
		assert.Equal(t, "cred-alice", credentialID)
	})

	t.Run("a login ticket and an unlock ticket share one use", func(t *testing.T) {
		ticket, err := authService.IssueAuthTicket("cred-alice")
		require.NoError(t, err)
		_, err = authService.RedeemAuthTicket(ticket, "alice")
		require.NoError(t, err)

		_, err = authService.LoginWithPasskeyTicket(ticket)
		assert.Error(t, err)
	})
}

func assertAPIStatus(t *testing.T, err error, status int) {
	t.Helper()
	require.Error(t, err)
	var apiErr *apierrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, status, apiErr.HTTPStatus)
}

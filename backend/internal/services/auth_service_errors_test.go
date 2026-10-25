package services_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/services"
)

func TestAuthService_TypedErrors(t *testing.T) {
	t.Run("unknown credential cannot get a ticket", func(t *testing.T) {
		us, as, _ := newAuthTestServices(t)
		require.NoError(t, us.CreateFirstUser("alice", "cred-a"))
		_, err := as.IssueAuthTicket("cred-unknown")
		apiErr := requireAPIError(t, err, apierrors.ErrCodeUnauthorized)
		assert.Equal(t, "Authentication failed", apiErr.Message)
		assert.ErrorIs(t, err, services.ErrInvalidCredentials)
	})

	t.Run("unknown or reused ticket is unauthorized", func(t *testing.T) {
		us, as, _ := newAuthTestServices(t)
		require.NoError(t, us.CreateFirstUser("alice", "cred-a"))
		_, err := as.LoginWithPasskeyTicket("forged")
		requireAPIError(t, err, apierrors.ErrCodeUnauthorized)
		assert.ErrorIs(t, err, services.ErrInvalidCredentials)

		ticket, err := as.IssueAuthTicket("cred-a")
		require.NoError(t, err)
		_, err = as.LoginWithPasskeyTicket(ticket)
		require.NoError(t, err)
		_, err = as.LoginWithPasskeyTicket(ticket)
		requireAPIError(t, err, apierrors.ErrCodeUnauthorized)
	})

	t.Run("a ticket whose user is gone is unauthorized", func(t *testing.T) {
		us, as, _ := newAuthTestServices(t)
		require.NoError(t, us.CreateFirstUser("alice", "cred-a"))
		ticket, err := as.IssueAuthTicket("cred-a")
		require.NoError(t, err)
		require.NoError(t, us.DeleteUser("alice"))

		_, err = as.LoginWithPasskeyTicket(ticket)
		apiErr := requireAPIError(t, err, apierrors.ErrCodeUnauthorized)
		assert.Equal(t, "Authentication failed", apiErr.Message, "user existence does not leak")
	})

	t.Run("invalid JWT is unauthorized", func(t *testing.T) {
		_, as, _ := newAuthTestServices(t)
		_, err := as.ValidateToken("not.a.jwt")
		requireAPIError(t, err, apierrors.ErrCodeUnauthorized)
		assert.ErrorIs(t, err, services.ErrInvalidToken)
	})

	t.Run("missing user is not found", func(t *testing.T) {
		_, as, _ := newAuthTestServices(t)
		_, err := as.GetUser("ghost")
		requireAPIError(t, err, apierrors.ErrCodeNotFound)
	})

	t.Run("invite errors pass through", func(t *testing.T) {
		us, as, _ := newAuthTestServices(t)
		require.NoError(t, us.CreateFirstUser("alice", "cred-a"))
		requireAPIError(t, as.CreateUserFromInvite("bogus", "bob", "cred-b"), apierrors.ErrCodeValidation)

		token, err := as.GenerateInviteToken("alice")
		require.NoError(t, err)
		requireAPIError(t, as.CreateUserFromInvite(token, "alice", "cred-b"), apierrors.ErrCodeAlreadyExists)
		requireAPIError(t, as.CreateFirstUser("mallory", "cred-m"), apierrors.ErrCodeConflict)
	})

	t.Run("store failures stay internal and never authenticate", func(t *testing.T) {
		us, as, dir := newAuthTestServices(t)
		require.NoError(t, us.CreateFirstUser("alice", "cred-a"))
		ticket, err := as.IssueAuthTicket("cred-a")
		require.NoError(t, err)
		unlockTicket, err := as.IssueAuthTicket("cred-a")
		require.NoError(t, err)
		corruptUserStore(t, dir)

		_, err = as.IssueAuthTicket("cred-a")
		requireInternal(t, err)
		resp, err := as.LoginWithPasskeyTicket(ticket)
		requireInternal(t, err)
		assert.Nil(t, resp)
		cred, err := as.RedeemAuthTicket(unlockTicket, "alice")
		requireInternal(t, err)
		assert.Empty(t, cred)
		_, err = as.GetUser("alice")
		requireInternal(t, err)
		_, err = as.IsFirstSetup()
		requireInternal(t, err)
	})
}

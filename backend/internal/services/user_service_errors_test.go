package services_test

import (
	"encoding/json"
	stderrors "errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/config"
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/services"
)

// requireAPIError asserts that err is (or wraps) an APIError with the given
// code and returns it.
func requireAPIError(t *testing.T, err error, code apierrors.ErrorCode) *apierrors.APIError {
	t.Helper()
	require.Error(t, err)
	var apiErr *apierrors.APIError
	require.True(t, stderrors.As(err, &apiErr), "want a typed %s error, got %v", code, err)
	assert.Equal(t, code, apiErr.Code, "err: %v", err)
	return apiErr
}

// requireInternal asserts that err is a plain (untyped) error, which the
// handlers answer with a 500 that only logs the cause.
func requireInternal(t *testing.T, err error) {
	t.Helper()
	require.Error(t, err)
	assert.False(t, apierrors.IsAPIError(err), "a store failure must stay an internal error, got %v", err)
}

func newAuthTestServices(t *testing.T) (*services.UserService, *services.AuthService, string) {
	t.Helper()
	dir := t.TempDir()
	us := services.NewUserService(dir)
	as := services.NewAuthService(&config.Config{JWTSecret: "test-secret", JWTExpiryHours: 24}, us)
	return us, as, dir
}

func corruptUserStore(t *testing.T, dir string) {
	t.Helper()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "users.json"), []byte("{corrupt"), 0600))
}

func TestUserService_TypedErrors(t *testing.T) {
	t.Run("first user when users exist is a conflict", func(t *testing.T) {
		us, _, _ := newAuthTestServices(t)
		require.NoError(t, us.CreateFirstUser("alice", "cred-a"))
		err := us.CreateFirstUser("mallory", "cred-m")
		apiErr := requireAPIError(t, err, apierrors.ErrCodeConflict)
		assert.Equal(t, http.StatusConflict, apiErr.HTTPStatus)
	})

	t.Run("duplicate user already exists", func(t *testing.T) {
		us, _, _ := newAuthTestServices(t)
		require.NoError(t, us.CreateFirstUser("alice", "cred-a"))
		apiErr := requireAPIError(t, us.CreateUser("alice", false, "cred-b"), apierrors.ErrCodeAlreadyExists)
		assert.Equal(t, "alice", apiErr.Details["identifier"])
	})

	t.Run("empty username or credential is invalid", func(t *testing.T) {
		us, _, _ := newAuthTestServices(t)
		requireAPIError(t, us.CreateUser("", false, "cred"), apierrors.ErrCodeValidation)
		requireAPIError(t, us.CreateUser("bob", false, ""), apierrors.ErrCodeValidation)
		requireAPIError(t, us.CreateFirstUser("", "cred"), apierrors.ErrCodeValidation)
		requireAPIError(t, us.CreateFirstUser("alice", ""), apierrors.ErrCodeValidation)
		first, err := us.IsFirstSetup()
		require.NoError(t, err)
		assert.True(t, first, "nothing was created")
	})

	t.Run("missing user is not found", func(t *testing.T) {
		us, _, _ := newAuthTestServices(t)
		require.NoError(t, us.CreateFirstUser("alice", "cred-a"))

		_, err := us.GetUserByUsername("bob")
		apiErr := requireAPIError(t, err, apierrors.ErrCodeNotFound)
		assert.Equal(t, "bob", apiErr.Details["identifier"])
		requireAPIError(t, us.DeleteUser("bob"), apierrors.ErrCodeNotFound)
		requireAPIError(t, us.UpdateLastLogin("bob"), apierrors.ErrCodeNotFound)
		requireAPIError(t, us.AddPasskeyToUser("bob", "cred-b"), apierrors.ErrCodeNotFound)

		_, err = us.GetUserByCredentialID("cred-unknown")
		apiErr = requireAPIError(t, err, apierrors.ErrCodeNotFound)
		assert.NotContains(t, apiErr.Error(), "cred-unknown", "the credential id is not echoed")
	})

	t.Run("store failures stay internal", func(t *testing.T) {
		us, _, dir := newAuthTestServices(t)
		corruptUserStore(t, dir)

		_, err := us.IsFirstSetup()
		requireInternal(t, err)
		requireInternal(t, us.CreateFirstUser("mallory", "cred"))
		requireInternal(t, us.CreateUser("bob", false, "cred"))
		requireInternal(t, us.DeleteUser("alice"))
		requireInternal(t, us.UpdateLastLogin("alice"))
		requireInternal(t, us.AddPasskeyToUser("alice", "cred"))
		_, err = us.GetUserByUsername("alice")
		requireInternal(t, err)
		_, err = us.GetUserByCredentialID("cred")
		requireInternal(t, err)
		_, err = us.ListUsers()
		requireInternal(t, err)
	})
}

func TestUserService_InviteTypedErrors(t *testing.T) {
	writeInviteFile := func(t *testing.T, dir, token string, data []byte) {
		t.Helper()
		require.NoError(t, os.MkdirAll(filepath.Join(dir, "invites"), 0755))
		require.NoError(t, os.WriteFile(filepath.Join(dir, "invites", token+".json"), data, 0600))
	}
	// A well-formed (64 hex chars) token that was never issued.
	token := strings.Repeat("0123456789abcdef", 4)

	t.Run("malformed and unknown tokens are invalid", func(t *testing.T) {
		us, _, _ := newAuthTestServices(t)
		for _, tok := range []string{"", "../users", "short", token} {
			_, err := us.ValidateInviteToken(tok)
			requireAPIError(t, err, apierrors.ErrCodeValidation)
			requireAPIError(t, us.ConsumeInviteToken(tok), apierrors.ErrCodeValidation)
		}
	})

	t.Run("expired token is invalid and removed", func(t *testing.T) {
		us, _, dir := newAuthTestServices(t)
		data, err := json.Marshal(services.Invite{Token: token, ExpiresAt: time.Now().Add(-time.Minute)})
		require.NoError(t, err)
		writeInviteFile(t, dir, token, data)

		_, err = us.ValidateInviteToken(token)
		requireAPIError(t, err, apierrors.ErrCodeValidation)
		_, statErr := os.Stat(filepath.Join(dir, "invites", token+".json"))
		assert.True(t, os.IsNotExist(statErr))
	})

	t.Run("a corrupt invite file is internal and still rejected", func(t *testing.T) {
		us, _, dir := newAuthTestServices(t)
		writeInviteFile(t, dir, token, []byte("{broken"))

		_, err := us.ValidateInviteToken(token)
		requireInternal(t, err)
		requireInternal(t, us.ConsumeInviteToken(token))
	})

	t.Run("an unwritable invites directory is internal", func(t *testing.T) {
		us, _, dir := newAuthTestServices(t)
		require.NoError(t, os.WriteFile(filepath.Join(dir, "invites"), []byte("x"), 0600))
		_, err := us.GenerateInviteToken("alice")
		requireInternal(t, err)
	})
}

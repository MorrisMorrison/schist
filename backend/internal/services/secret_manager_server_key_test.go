package services_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/config"
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/services"
)

const serverSecret = "a long server secret used to protect the GitHub token"

// restart builds a fresh, locked SecretManager over the same data dir, as a
// server restart does.
func restart(t *testing.T, dir string, ps *services.PasskeyService, secret string) (*services.SecretManager, *config.Settings) {
	t.Helper()
	settings, err := config.LoadSettings(dir)
	require.NoError(t, err)
	sm := services.NewSecretManager(settings, dir, ps)
	if secret != "" {
		require.NoError(t, sm.UseServerKey(secret))
	}
	return sm, settings
}

func TestSecretManager_ServerKey(t *testing.T) {
	t.Run("the token is saved and read without unlocking, also after a restart", func(t *testing.T) {
		ps, dir := newTestPasskeyService(t, "cred-1")
		sm, settings := restart(t, dir, ps, serverSecret)
		require.False(t, sm.IsUnlocked())
		assert.True(t, sm.CanStoreGitHubToken())

		require.NoError(t, sm.SetGitHubToken("ghp_example"))
		stored := settings.GetGitHubSettings().Token
		require.NotNil(t, stored)
		assert.True(t, stored.Encrypted)
		assert.Equal(t, "server", stored.Key)

		raw, err := os.ReadFile(filepath.Join(dir, ".schist", "config.json"))
		require.NoError(t, err)
		assert.NotContains(t, string(raw), "ghp_example", "the token is never written in plain text")

		got, err := sm.GetGitHubToken()
		require.NoError(t, err)
		assert.Equal(t, "ghp_example", got)

		after, _ := restart(t, dir, ps, serverSecret)
		assert.True(t, after.CanUseGitHubToken())
		got, err = after.GetGitHubToken()
		require.NoError(t, err)
		assert.Equal(t, "ghp_example", got)
	})

	t.Run("a changed key asks for the token again instead of failing obscurely", func(t *testing.T) {
		ps, dir := newTestPasskeyService(t, "cred-1")
		sm, _ := restart(t, dir, ps, serverSecret)
		require.NoError(t, sm.SetGitHubToken("ghp_example"))

		rotated, _ := restart(t, dir, ps, "a different server secret after rotation")
		_, err := rotated.GetGitHubToken()
		require.Error(t, err)
		assert.Equal(t, apierrors.ErrCodeInvalidState, apiErrorCode(err))
	})

	t.Run("without the key the server token can't be read", func(t *testing.T) {
		ps, dir := newTestPasskeyService(t, "cred-1")
		sm, _ := restart(t, dir, ps, serverSecret)
		require.NoError(t, sm.SetGitHubToken("ghp_example"))

		noKey, _ := restart(t, dir, ps, "")
		assert.False(t, noKey.CanUseGitHubToken())
		_, err := noKey.GetGitHubToken()
		require.Error(t, err)
		assert.Equal(t, apierrors.ErrCodeInvalidState, apiErrorCode(err))
	})

	t.Run("an older passkey-protected token moves to the server key on first unlocked read", func(t *testing.T) {
		ps, dir := newTestPasskeyService(t, "cred-1")
		old, _ := restart(t, dir, ps, "")
		require.NoError(t, old.UnlockWithPasskey("cred-1"))
		require.NoError(t, old.SetGitHubToken("ghp_example"))

		sm, settings := restart(t, dir, ps, serverSecret)
		assert.False(t, sm.CanUseGitHubToken(), "still needs the passkey until it has moved")
		_, err := sm.GetGitHubToken()
		assert.Equal(t, apierrors.ErrCodeSecretsLocked, apiErrorCode(err))

		require.NoError(t, sm.UnlockWithPasskey("cred-1"))
		got, err := sm.GetGitHubToken()
		require.NoError(t, err)
		assert.Equal(t, "ghp_example", got)
		assert.Equal(t, "server", settings.GetGitHubSettings().Token.Key, "re-encrypted with the server key")

		after, _ := restart(t, dir, ps, serverSecret)
		got, err = after.GetGitHubToken()
		require.NoError(t, err, "readable after a restart without unlocking")
		assert.Equal(t, "ghp_example", got)
	})

	t.Run("without a server key nothing changes: the token needs the unlocked store", func(t *testing.T) {
		ps, dir := newTestPasskeyService(t, "cred-1")
		sm, _ := restart(t, dir, ps, "")
		assert.False(t, sm.CanStoreGitHubToken())
		err := sm.SetGitHubToken("ghp_example")
		assert.Equal(t, apierrors.ErrCodeSecretsLocked, apiErrorCode(err))

		require.NoError(t, sm.UnlockWithPasskey("cred-1"))
		require.NoError(t, sm.SetGitHubToken("ghp_example"))
		assert.Empty(t, sm.GitHubTokenKey(), "stored with the passkey store")
	})

	t.Run("an empty server secret is rejected", func(t *testing.T) {
		ps, dir := newTestPasskeyService(t)
		settings, err := config.LoadSettings(dir)
		require.NoError(t, err)
		sm := services.NewSecretManager(settings, dir, ps)
		assert.Error(t, sm.UseServerKey(""))
	})
}

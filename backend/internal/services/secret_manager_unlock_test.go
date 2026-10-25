package services_test

import (
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/crypto"
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/services"
)

func newUnlockableSecretManager(t *testing.T, credentialIDs ...string) (*services.SecretManager, *config.Settings, string) {
	t.Helper()
	ps, dir := newTestPasskeyService(t, credentialIDs...)
	settings, err := config.LoadSettings(dir)
	require.NoError(t, err)
	return services.NewSecretManager(settings, dir, ps), settings, dir
}

func TestSecretManager_UnlockWithPasskey(t *testing.T) {
	t.Run("unknown passkey is unauthorized and stays locked", func(t *testing.T) {
		sm, _, _ := newUnlockableSecretManager(t, "cred-1")
		err := sm.UnlockWithPasskey("someone-else")
		require.Error(t, err)
		assert.Equal(t, apierrors.ErrCodeUnauthorized, apiErrorCode(err))
		assert.False(t, sm.IsUnlocked())
	})

	t.Run("first unlock sets up the secrets config", func(t *testing.T) {
		sm, settings, dir := newUnlockableSecretManager(t, "cred-1")
		require.Nil(t, settings.GetSecretsConfig())

		require.NoError(t, sm.UnlockWithPasskey("cred-1"))
		assert.True(t, sm.IsUnlocked())
		sc := settings.GetSecretsConfig()
		require.NotNil(t, sc)
		assert.Equal(t, "passkey", sc.KeyDerivation)
		assert.NotEmpty(t, sc.Salt)

		reloaded, err := config.LoadSettings(dir)
		require.NoError(t, err)
		assert.NotNil(t, reloaded.GetSecretsConfig(), "secrets config must be persisted")

		require.NoError(t, sm.UnlockWithPasskey("cred-1"), "unlocking twice is a no-op")
	})

	t.Run("a plaintext GitHub token is encrypted on unlock", func(t *testing.T) {
		sm, settings, dir := newUnlockableSecretManager(t, "cred-1")
		settings.GitHub.Token = crypto.NewEncryptedValue("ghp_plain", false)
		require.NoError(t, settings.Save(dir))
		require.True(t, settings.HasPlaintextSecrets())

		require.NoError(t, sm.UnlockWithPasskey("cred-1"))
		assert.False(t, settings.HasPlaintextSecrets())
		assert.True(t, settings.GitHub.Token.Encrypted)

		onDisk, err := os.ReadFile(filepath.Join(dir, ".schist", "config.json"))
		require.NoError(t, err)
		assert.NotContains(t, string(onDisk), "ghp_plain", "plaintext token must be gone from disk")

		token, err := sm.GetGitHubToken()
		require.NoError(t, err)
		assert.Equal(t, "ghp_plain", token)
	})
}

func TestSecretManager_SecretLifecycle(t *testing.T) {
	sm, settings, dir := newUnlockableSecretManager(t, "cred-1")
	require.NoError(t, sm.UnlockWithPasskey("cred-1"))

	keys, err := sm.ListSecrets()
	require.NoError(t, err)
	assert.Empty(t, keys)
	assert.False(t, sm.HasSecrets())

	err = sm.SetSecret("", "v")
	assert.Equal(t, apierrors.ErrCodeMissingRequired, apiErrorCode(err))

	require.NoError(t, sm.SetSecret("api", "s3cret"))
	require.NoError(t, sm.SetSecret("db", "hunter2"))
	assert.True(t, sm.HasSecrets())

	onDisk, err := os.ReadFile(filepath.Join(dir, ".schist", "config.json"))
	require.NoError(t, err)
	assert.NotContains(t, string(onDisk), "s3cret", "secrets are stored encrypted")

	value, err := sm.GetSecret("api")
	require.NoError(t, err)
	assert.Equal(t, "s3cret", value)

	_, err = sm.GetSecret("missing")
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))

	keys, err = sm.ListSecrets()
	require.NoError(t, err)
	sort.Strings(keys)
	assert.Equal(t, []string{"api", "db"}, keys)

	require.NoError(t, sm.DeleteSecret("db"))
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(sm.DeleteSecret("db")))

	t.Run("survives lock and re-unlock with the same passkey", func(t *testing.T) {
		sm.Lock()
		assert.False(t, sm.IsUnlocked())
		_, err := sm.GetSecret("api")
		assert.Equal(t, apierrors.ErrCodeUnauthorized, apiErrorCode(err))

		reloaded, err := config.LoadSettings(dir)
		require.NoError(t, err)
		ps, err := services.NewPasskeyService(&config.Config{DataDir: dir, FrontendURL: "http://localhost:5173"})
		require.NoError(t, err)
		fresh := services.NewSecretManager(reloaded, dir, ps)
		require.NoError(t, fresh.UnlockWithPasskey("cred-1"))
		value, err := fresh.GetSecret("api")
		require.NoError(t, err)
		assert.Equal(t, "s3cret", value)
	})

	t.Run("operations without a secrets config", func(t *testing.T) {
		require.NoError(t, sm.UnlockWithPasskey("cred-1"))
		settings.Secrets = nil

		assert.Equal(t, apierrors.ErrCodeInvalidState, apiErrorCode(sm.SetSecret("k", "v")))
		_, err := sm.GetSecret("k")
		assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))
		keys, err := sm.ListSecrets()
		require.NoError(t, err)
		assert.Empty(t, keys)
		assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(sm.DeleteSecret("k")))

		settings.Secrets = &config.SecretsConfig{Version: 1}
		require.NoError(t, sm.SetSecret("k", "v"), "a nil store map is created on first write")
	})
}

func TestSecretManager_GitHubToken(t *testing.T) {
	sm, settings, _ := newUnlockableSecretManager(t, "cred-1")
	require.NoError(t, sm.UnlockWithPasskey("cred-1"))

	token, err := sm.GetGitHubToken()
	require.NoError(t, err)
	assert.Empty(t, token, "no token configured")

	require.NoError(t, sm.SetGitHubToken("ghp_x"))
	assert.True(t, settings.GitHub.Token.Encrypted)
	token, err = sm.GetGitHubToken()
	require.NoError(t, err)
	assert.Equal(t, "ghp_x", token)
}

func TestSecretManager_SetupState(t *testing.T) {
	t.Run("no passkeys and no secrets needs setup", func(t *testing.T) {
		sm, _, _ := newUnlockableSecretManager(t)
		assert.True(t, sm.RequiresSetup())
		assert.False(t, sm.RequiresPassword())
		has, err := sm.HasPasskeys()
		require.NoError(t, err)
		assert.False(t, has)
	})

	t.Run("plaintext secrets without passkeys still need a password", func(t *testing.T) {
		sm, settings, _ := newUnlockableSecretManager(t)
		settings.GitHub.Token = crypto.NewEncryptedValue("ghp", false)
		assert.True(t, sm.RequiresPassword())
		assert.False(t, sm.RequiresSetup())
	})

	t.Run("a registered passkey means no password and no setup", func(t *testing.T) {
		sm, settings, _ := newUnlockableSecretManager(t, "cred-1")
		settings.GitHub.Token = crypto.NewEncryptedValue("ghp", false)
		assert.False(t, sm.RequiresPassword())
		assert.False(t, sm.RequiresSetup())
		has, err := sm.HasPasskeys()
		require.NoError(t, err)
		assert.True(t, has)
	})
}

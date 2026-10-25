package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/crypto"
)

func configPath(dataDir string) string {
	return filepath.Join(dataDir, ".schist", "config.json")
}

func TestLoadSettings_CreatesDefaults(t *testing.T) {
	dataDir := t.TempDir()

	s, err := LoadSettings(dataDir)
	require.NoError(t, err)
	assert.False(t, s.GitHub.Enabled)
	assert.Equal(t, "main", s.GitHub.Branch)
	assert.Equal(t, "auto", s.GetUISettings().Theme)
	assert.Equal(t, "1.0.0", s.GetSystemSettings().Version)
	assert.False(t, s.GetSystemSettings().CreatedAt.IsZero())
	assert.Nil(t, s.GetSecretsConfig())
	assert.False(t, s.HasPlaintextSecrets())

	info, err := os.Stat(configPath(dataDir))
	require.NoError(t, err)
	if runtime.GOOS != "windows" {
		assert.Equal(t, os.FileMode(0o600), info.Mode().Perm(), "config holds secrets")
	}
}

func TestSettings_RoundTrip(t *testing.T) {
	dataDir := t.TempDir()
	s, err := LoadSettings(dataDir)
	require.NoError(t, err)

	gh := *s.GetGitHubSettings()
	gh.Enabled, gh.Owner, gh.Repository, gh.ForcePush = true, "octo", "wiki", true
	gh.Token = crypto.NewEncryptedValue("ciphertext", true)
	require.NoError(t, s.UpdateGitHubSettings(dataDir, &gh))
	require.NoError(t, s.UpdateUISettings(dataDir, &UISettings{Theme: "dark"}))
	require.NoError(t, s.UpdateSecretsConfig(dataDir, &SecretsConfig{
		Version: 1, KeyDerivation: "passkey", Salt: "c2FsdA==",
		Store: map[string]*crypto.EncryptedValue{"k": crypto.NewEncryptedValue("enc", true)},
	}))

	loaded, err := LoadSettings(dataDir)
	require.NoError(t, err)
	assert.True(t, loaded.GitHub.Enabled)
	assert.Equal(t, "octo", loaded.GitHub.Owner)
	assert.True(t, loaded.GitHub.ForcePush)
	require.NotNil(t, loaded.GitHub.Token)
	assert.True(t, loaded.GitHub.Token.Encrypted)
	assert.Equal(t, "dark", loaded.UI.Theme)
	require.NotNil(t, loaded.GetSecretsConfig())
	assert.Equal(t, "passkey", loaded.Secrets.KeyDerivation)
	assert.Contains(t, loaded.Secrets.Store, "k")
	assert.False(t, loaded.HasPlaintextSecrets())
	assert.False(t, loaded.System.UpdatedAt.Before(loaded.System.CreatedAt))
}

// Older configs stored the GitHub token as a bare string; it is read back as
// a plaintext value so it can be migrated.
func TestLoadSettings_LegacyPlaintextToken(t *testing.T) {
	dataDir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Dir(configPath(dataDir)), 0o755))
	legacy := map[string]any{"github": map[string]any{"enabled": true, "token": "ghp_plain", "branch": "main"}}
	raw, err := json.Marshal(legacy)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(configPath(dataDir), raw, 0o600))

	s, err := LoadSettings(dataDir)
	require.NoError(t, err)
	require.NotNil(t, s.GitHub.Token)
	assert.Equal(t, "ghp_plain", s.GitHub.Token.Value)
	assert.True(t, s.HasPlaintextSecrets())

	store, err := crypto.NewSecureStoreWithKey(make([]byte, 32), make([]byte, 16))
	require.NoError(t, err)
	require.NoError(t, s.MigratePlaintextSecrets(dataDir, store))
	assert.False(t, s.HasPlaintextSecrets())

	onDisk, err := os.ReadFile(configPath(dataDir))
	require.NoError(t, err)
	assert.NotContains(t, string(onDisk), "ghp_plain", "migration must not leave the token in plaintext")

	decrypted, err := store.Decrypt(s.GitHub.Token)
	require.NoError(t, err)
	assert.Equal(t, "ghp_plain", decrypted)

	// Nothing to migrate the second time.
	require.NoError(t, s.MigratePlaintextSecrets(dataDir, store))
}

func TestLoadSettings_Errors(t *testing.T) {
	t.Run("corrupt JSON", func(t *testing.T) {
		dataDir := t.TempDir()
		require.NoError(t, os.MkdirAll(filepath.Dir(configPath(dataDir)), 0o755))
		require.NoError(t, os.WriteFile(configPath(dataDir), []byte("{not json"), 0o600))
		_, err := LoadSettings(dataDir)
		assert.Error(t, err)
	})

	t.Run("wrong JSON shape", func(t *testing.T) {
		dataDir := t.TempDir()
		require.NoError(t, os.MkdirAll(filepath.Dir(configPath(dataDir)), 0o755))
		require.NoError(t, os.WriteFile(configPath(dataDir), []byte(`{"github":{"enabled":"yes"}}`), 0o600))
		_, err := LoadSettings(dataDir)
		assert.Error(t, err)
	})

	t.Run(".schist is a file", func(t *testing.T) {
		dataDir := t.TempDir()
		require.NoError(t, os.WriteFile(filepath.Join(dataDir, ".schist"), []byte("x"), 0o600))
		_, err := LoadSettings(dataDir)
		assert.Error(t, err)
	})

	t.Run("config.json is a directory", func(t *testing.T) {
		dataDir := t.TempDir()
		require.NoError(t, os.MkdirAll(configPath(dataDir), 0o755))
		_, err := LoadSettings(dataDir)
		assert.Error(t, err)
	})

	t.Run("save into a missing directory", func(t *testing.T) {
		s := createDefaultSettings()
		assert.Error(t, s.Save(filepath.Join(t.TempDir(), "does-not-exist")))
	})
}

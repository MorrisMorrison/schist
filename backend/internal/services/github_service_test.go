package services_test

import (
	"os"
	"testing"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupGitHubTestDir(t *testing.T) (string, *config.Settings, func()) {
	testDir, err := os.MkdirTemp("", "schist-github-test-*")
	require.NoError(t, err)

	settings, err := config.LoadSettings(testDir)
	require.NoError(t, err)

	cleanup := func() {
		os.RemoveAll(testDir)
	}

	return testDir, settings, cleanup
}

func TestGitHubService_Disconnect(t *testing.T) {
	testDir, settings, cleanup := setupGitHubTestDir(t)
	defer cleanup()

	cfg := &config.Config{DataDir: testDir}
	secretManager := services.NewSecretManager(settings, testDir, nil)
	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	service := services.NewGitHubService(cfg, gitService, settings, secretManager)

	initialSettings := &config.GitHubSettings{
		Enabled:    true,
		Owner:      "testowner",
		Repository: "testrepo",
		Branch:     "main",
		AutoSync:   true,
		SyncOnSave: false,
	}
	err = settings.UpdateGitHubSettings(testDir, initialSettings)
	require.NoError(t, err)

	err = service.Disconnect()
	require.NoError(t, err)

	updatedSettings := settings.GetGitHubSettings()
	assert.False(t, updatedSettings.Enabled)
	assert.Empty(t, updatedSettings.Owner)
	assert.Empty(t, updatedSettings.Repository)
	assert.Empty(t, updatedSettings.Branch)
	assert.False(t, updatedSettings.AutoSync)
	assert.False(t, updatedSettings.SyncOnSave)
	assert.Nil(t, updatedSettings.Token)
}

func TestGitHubService_GetSyncStatus_WithoutClient(t *testing.T) {
	testDir, settings, cleanup := setupGitHubTestDir(t)
	defer cleanup()

	cfg := &config.Config{DataDir: testDir}
	secretManager := services.NewSecretManager(settings, testDir, nil)
	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	service := services.NewGitHubService(cfg, gitService, settings, secretManager)

	githubSettings := &config.GitHubSettings{
		Enabled:    true,
		Owner:      "testowner",
		Repository: "testrepo",
		Branch:     "main",
		AutoSync:   false,
		SyncOnSave: true,
	}
	err = settings.UpdateGitHubSettings(testDir, githubSettings)
	require.NoError(t, err)

	config := service.GetGitHubSettings()

	assert.True(t, config.Enabled)
	assert.Equal(t, "testowner", config.Owner)
	assert.Equal(t, "testrepo", config.Repository)
	assert.Equal(t, "main", config.Branch)
	assert.False(t, config.AutoSync)
	assert.True(t, config.SyncOnSave)

	connectionStatus, err := service.GetGitHubConnectionStatus()
	if err == nil {
		assert.False(t, connectionStatus.Connected)
	}
}

func TestGitHubService_GetSyncStatus_Disabled(t *testing.T) {
	testDir, settings, cleanup := setupGitHubTestDir(t)
	defer cleanup()

	cfg := &config.Config{DataDir: testDir}
	secretManager := services.NewSecretManager(settings, testDir, nil)
	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	service := services.NewGitHubService(cfg, gitService, settings, secretManager)

	githubSettings := &config.GitHubSettings{
		Enabled:    false,
		Owner:      "",
		Repository: "",
		Branch:     "",
		AutoSync:   false,
		SyncOnSave: false,
	}
	err = settings.UpdateGitHubSettings(testDir, githubSettings)
	require.NoError(t, err)

	config := service.GetGitHubSettings()

	assert.False(t, config.Enabled)
	assert.Empty(t, config.Owner)
	assert.Empty(t, config.Repository)
	assert.Empty(t, config.Branch)
	assert.False(t, config.AutoSync)
	assert.False(t, config.SyncOnSave)
	// Connected status would require connection test (which needs secrets)
}

func TestGitHubService_IsEnabled(t *testing.T) {
	testDir, settings, cleanup := setupGitHubTestDir(t)
	defer cleanup()

	cfg := &config.Config{DataDir: testDir}
	secretManager := services.NewSecretManager(settings, testDir, nil)
	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	service := services.NewGitHubService(cfg, gitService, settings, secretManager)

	githubSettings := &config.GitHubSettings{Enabled: false}
	err = settings.UpdateGitHubSettings(testDir, githubSettings)
	require.NoError(t, err)
	assert.False(t, service.IsEnabled())

	githubSettings.Enabled = true
	err = settings.UpdateGitHubSettings(testDir, githubSettings)
	require.NoError(t, err)
	assert.True(t, service.IsEnabled())
}

func TestGitHubService_ShouldAutoSync(t *testing.T) {
	testDir, settings, cleanup := setupGitHubTestDir(t)
	defer cleanup()

	cfg := &config.Config{DataDir: testDir}
	secretManager := services.NewSecretManager(settings, testDir, nil)
	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	service := services.NewGitHubService(cfg, gitService, settings, secretManager)

	githubSettings := &config.GitHubSettings{
		Enabled:  false,
		AutoSync: true,
	}
	err = settings.UpdateGitHubSettings(testDir, githubSettings)
	require.NoError(t, err)
	assert.False(t, service.ShouldAutoSync())

	githubSettings.Enabled = true
	err = settings.UpdateGitHubSettings(testDir, githubSettings)
	require.NoError(t, err)
	assert.True(t, service.ShouldAutoSync())

	githubSettings.AutoSync = false
	err = settings.UpdateGitHubSettings(testDir, githubSettings)
	require.NoError(t, err)
	assert.False(t, service.ShouldAutoSync())
}

func TestGitHubService_ShouldSyncOnSave(t *testing.T) {
	testDir, settings, cleanup := setupGitHubTestDir(t)
	defer cleanup()

	cfg := &config.Config{DataDir: testDir}
	secretManager := services.NewSecretManager(settings, testDir, nil)
	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	service := services.NewGitHubService(cfg, gitService, settings, secretManager)

	githubSettings := &config.GitHubSettings{
		Enabled:    false,
		SyncOnSave: true,
	}
	err = settings.UpdateGitHubSettings(testDir, githubSettings)
	require.NoError(t, err)
	assert.False(t, service.ShouldSyncOnSave())

	githubSettings.Enabled = true
	err = settings.UpdateGitHubSettings(testDir, githubSettings)
	require.NoError(t, err)
	assert.True(t, service.ShouldSyncOnSave())

	githubSettings.SyncOnSave = false
	err = settings.UpdateGitHubSettings(testDir, githubSettings)
	require.NoError(t, err)
	assert.False(t, service.ShouldSyncOnSave())
}

// TestGitHubSettings_ForcePush_RoundTrip verifies the opt-in ForcePush setting
// defaults to false (safe FF-only) and persists through save + reload.
func TestGitHubSettings_ForcePush_RoundTrip(t *testing.T) {
	testDir, settings, cleanup := setupGitHubTestDir(t)
	defer cleanup()

	// Default (zero value) is false: safe fast-forward-only push.
	assert.False(t, settings.GetGitHubSettings().ForcePush)

	githubSettings := &config.GitHubSettings{
		Enabled:    true,
		Owner:      "testowner",
		Repository: "testrepo",
		Branch:     "main",
		ForcePush:  true,
	}
	err := settings.UpdateGitHubSettings(testDir, githubSettings)
	require.NoError(t, err)

	// Reload from disk to confirm the field round-trips through JSON.
	reloaded, err := config.LoadSettings(testDir)
	require.NoError(t, err)
	assert.True(t, reloaded.GetGitHubSettings().ForcePush)
}

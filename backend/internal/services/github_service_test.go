package services_test

import (
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupGitHubService(t *testing.T, testDir string) (*services.GitHubService, *config.Settings) {
	cfg := &config.Config{
		DataDir: testDir,
	}

	settings, err := config.LoadSettings(testDir)
	require.NoError(t, err)

	gitService, err := services.NewGitService(testDir)
	if err != nil {
		t.Skipf("Skipping test, git service not available: %v", err)
	}

	secretManager := services.NewSecretManager(settings, testDir, nil)

	githubService := services.NewGitHubService(cfg, gitService, settings, secretManager)

	return githubService, settings
}

func TestAddDocsRepository(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	githubService, _ := setupGitHubService(t, testDir)

	tests := []struct {
		name       string
		owner      string
		repo       string
		docsFolder string
		wantErr    bool
	}{
		{
			name:       "valid repository with default docs folder",
			owner:      "testowner",
			repo:       "testrepo",
			docsFolder: "",
			wantErr:    false,
		},
		{
			name:       "valid repository with custom docs folder",
			owner:      "testowner",
			repo:       "customrepo",
			docsFolder: "documentation",
			wantErr:    false,
		},
		{
			name:       "empty owner",
			owner:      "",
			repo:       "testrepo",
			docsFolder: "docs",
			wantErr:    true,
		},
		{
			name:       "empty repository",
			owner:      "testowner",
			repo:       "",
			docsFolder: "docs",
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := githubService.AddDocsRepository(tt.owner, tt.repo, tt.docsFolder)

			if tt.wantErr {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)

			expectedDocsFolder := tt.docsFolder
			if expectedDocsFolder == "" {
				expectedDocsFolder = "docs"
			}

			repos, err := githubService.GetDocsRepositories()
			require.NoError(t, err)

			found := false
			for _, repo := range repos {
				if repo.Owner == tt.owner && repo.Repository == tt.repo {
					found = true
					assert.Equal(t, expectedDocsFolder, repo.DocsFolder)
					assert.Equal(t, 0, repo.DocumentCount)
					assert.Empty(t, repo.SyncError)
					break
				}
			}
			assert.True(t, found, "Repository should be found in saved repositories")
		})
	}
}

func TestRemoveDocsRepository(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	githubService, _ := setupGitHubService(t, testDir)

	err := githubService.AddDocsRepository("testowner", "testrepo", "docs")
	require.NoError(t, err)

	repos, err := githubService.GetDocsRepositories()
	require.NoError(t, err)
	assert.Len(t, repos, 1)

	tests := []struct {
		name    string
		owner   string
		repo    string
		wantErr bool
	}{
		{
			name:    "remove existing repository",
			owner:   "testowner",
			repo:    "testrepo",
			wantErr: false,
		},
		{
			name:    "remove non-existent repository",
			owner:   "nonexistent",
			repo:    "repo",
			wantErr: false,
		},
		{
			name:    "empty owner",
			owner:   "",
			repo:    "testrepo",
			wantErr: true,
		},
		{
			name:    "empty repository",
			owner:   "testowner",
			repo:    "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := githubService.RemoveDocsRepository(tt.owner, tt.repo)

			if tt.wantErr {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)

			if tt.owner == "testowner" && tt.repo == "testrepo" {
				repos, err := githubService.GetDocsRepositories()
				require.NoError(t, err)
				assert.Len(t, repos, 0, "Repository should be removed")
			}
		})
	}
}

func TestGetDocsRepositories(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	githubService, _ := setupGitHubService(t, testDir)

	repos, err := githubService.GetDocsRepositories()
	require.NoError(t, err)
	assert.Len(t, repos, 0, "Should start with no repositories")

	err = githubService.AddDocsRepository("owner1", "repo1", "docs")
	require.NoError(t, err)

	err = githubService.AddDocsRepository("owner2", "repo2", "documentation")
	require.NoError(t, err)

	repos, err = githubService.GetDocsRepositories()
	require.NoError(t, err)
	assert.Len(t, repos, 2, "Should have 2 repositories")

	expectedRepos := map[string]models.GitHubRepoConfig{
		"owner1/repo1": {
			Owner:         "owner1",
			Repository:    "repo1",
			DocsFolder:    "docs",
			LastSync:      time.Time{},
			SyncError:     "",
			DocumentCount: 0,
		},
		"owner2/repo2": {
			Owner:         "owner2",
			Repository:    "repo2",
			DocsFolder:    "documentation",
			LastSync:      time.Time{},
			SyncError:     "",
			DocumentCount: 0,
		},
	}

	for _, repo := range repos {
		key := repo.Owner + "/" + repo.Repository
		expected, exists := expectedRepos[key]
		require.True(t, exists, "Repository %s should exist", key)
		assert.Equal(t, expected.Owner, repo.Owner)
		assert.Equal(t, expected.Repository, repo.Repository)
		assert.Equal(t, expected.DocsFolder, repo.DocsFolder)
		assert.Equal(t, expected.DocumentCount, repo.DocumentCount)
		assert.Equal(t, expected.SyncError, repo.SyncError)
	}
}

func TestGetRepositoryStructure_ValidationOnly(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	githubService, _ := setupGitHubService(t, testDir)

	tests := []struct {
		name    string
		owner   string
		repo    string
		path    string
		wantErr bool
	}{
		{
			name:    "empty owner",
			owner:   "",
			repo:    "testrepo",
			path:    "docs",
			wantErr: true,
		},
		{
			name:    "empty repository",
			owner:   "testowner",
			repo:    "",
			path:    "docs",
			wantErr: true,
		},
		{
			name:    "valid parameters but no client",
			owner:   "testowner",
			repo:    "testrepo",
			path:    "docs",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := githubService.GetRepositoryStructure(tt.owner, tt.repo, tt.path)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestGetDocumentContent_ValidationOnly(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	githubService, _ := setupGitHubService(t, testDir)

	tests := []struct {
		name    string
		owner   string
		repo    string
		path    string
		wantErr bool
	}{
		{
			name:    "empty owner",
			owner:   "",
			repo:    "testrepo",
			path:    "docs/readme.md",
			wantErr: true,
		},
		{
			name:    "empty repository",
			owner:   "testowner",
			repo:    "",
			path:    "docs/readme.md",
			wantErr: true,
		},
		{
			name:    "empty path",
			owner:   "testowner",
			repo:    "testrepo",
			path:    "",
			wantErr: true,
		},
		{
			name:    "valid parameters but no client",
			owner:   "testowner",
			repo:    "testrepo",
			path:    "docs/readme.md",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := githubService.GetDocumentContent(tt.owner, tt.repo, tt.path)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestListDocsFiles_ValidationOnly(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	githubService, _ := setupGitHubService(t, testDir)

	tests := []struct {
		name    string
		owner   string
		repo    string
		wantErr bool
	}{
		{
			name:    "empty owner",
			owner:   "",
			repo:    "testrepo",
			wantErr: true,
		},
		{
			name:    "empty repository",
			owner:   "testowner",
			repo:    "",
			wantErr: true,
		},
		{
			name:    "valid parameters but no client",
			owner:   "testowner",
			repo:    "testrepo",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := githubService.ListDocsFiles(tt.owner, tt.repo)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

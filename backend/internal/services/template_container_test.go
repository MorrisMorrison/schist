package services_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/services"
)

func TestTemplateService_GetTemplates(t *testing.T) {
	t.Run("creates a missing templates dir and returns none", func(t *testing.T) {
		dir := filepath.Join(t.TempDir(), "templates")
		ts := services.NewTemplateService(&config.Config{TemplatesDir: dir})
		templates, err := ts.GetTemplates()
		require.NoError(t, err)
		assert.Empty(t, templates)
		info, err := os.Stat(dir)
		require.NoError(t, err)
		assert.True(t, info.IsDir())
	})

	t.Run("loads valid templates and skips the rest", func(t *testing.T) {
		dir := t.TempDir()
		files := map[string]string{
			"meeting.md":         "---\ntitle: Meeting\ndescription: Notes from a meeting\ntags: [work, notes]\ncategory: Work\n---\n\n# Meeting\n\n- attendees\n",
			"no-front-matter.md": "# Just text\n",
			"bad-yaml.md":        "---\ntitle: [unclosed\n---\nbody\n",
			"readme.txt":         "---\ntitle: Not a template\n---\nbody\n",
		}
		for name, content := range files {
			require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte(content), 0644))
		}
		require.NoError(t, os.Mkdir(filepath.Join(dir, "sub.md"), 0755))

		templates, err := services.NewTemplateService(&config.Config{TemplatesDir: dir}).GetTemplates()
		require.NoError(t, err)
		require.Len(t, templates, 1)
		tpl := templates[0]
		assert.Equal(t, "meeting", tpl.ID)
		assert.Equal(t, "Meeting", tpl.Title)
		assert.Equal(t, "Notes from a meeting", tpl.Description)
		assert.Equal(t, []string{"work", "notes"}, tpl.Tags)
		assert.Equal(t, "Work", tpl.Category)
		assert.Equal(t, "# Meeting\n\n- attendees", tpl.Content)
	})

	t.Run("templates path that is a file", func(t *testing.T) {
		file := filepath.Join(t.TempDir(), "templates")
		require.NoError(t, os.WriteFile(file, []byte("x"), 0644))
		_, err := services.NewTemplateService(&config.Config{TemplatesDir: file}).GetTemplates()
		assert.Error(t, err)
	})
}

func setServicesEnv(t *testing.T, dataDir string) {
	t.Helper()
	t.Setenv("ENV", "development")
	t.Setenv("SCHIST_DATA_DIR", dataDir)
	t.Setenv("SCHIST_FRONTEND_URL", "http://localhost:5173")
	t.Setenv("SCHIST_JWT_SECRET", "")
	t.Setenv("SCHIST_TEMPLATES_DIR", filepath.Join(dataDir, "..", "templates"))
}

func TestNewServices(t *testing.T) {
	t.Run("wires every service against the data dir", func(t *testing.T) {
		dataDir := t.TempDir()
		setServicesEnv(t, dataDir)

		s, err := services.NewServices()
		require.NoError(t, err)
		assert.Equal(t, dataDir, s.Config.DataDir)
		for name, svc := range map[string]any{
			"Settings": s.Settings, "SecretManager": s.SecretManager, "PasskeyService": s.PasskeyService,
			"UserService": s.UserService, "AssetService": s.AssetService, "IgnoreService": s.IgnoreService,
			"GitService": s.GitService, "TemplateService": s.TemplateService, "DocumentService": s.DocumentService,
			"LinkService": s.LinkService, "GitHubService": s.GitHubService, "AuthService": s.AuthService,
			"ShareService": s.ShareService,
		} {
			assert.NotNil(t, svc, name)
		}
		assert.False(t, s.SecretManager.IsUnlocked(), "secrets start locked")

		_, err = os.Stat(filepath.Join(dataDir, ".git"))
		assert.NoError(t, err, "a git repository is initialised")
		_, err = os.Stat(filepath.Join(dataDir, ".schist", "config.json"))
		assert.NoError(t, err, "default settings are written")
	})

	t.Run("invalid config", func(t *testing.T) {
		setServicesEnv(t, t.TempDir())
		t.Setenv("ENV", "production")
		t.Setenv("SCHIST_JWT_SECRET", "short")
		_, err := services.NewServices()
		assert.ErrorContains(t, err, "failed to load config")
	})

	t.Run("unusable data dir", func(t *testing.T) {
		dataDir := t.TempDir()
		setServicesEnv(t, dataDir)
		require.NoError(t, os.WriteFile(filepath.Join(dataDir, ".schist"), []byte("x"), 0644))
		_, err := services.NewServices()
		assert.ErrorContains(t, err, "failed to load settings")
	})

	t.Run("invalid frontend URL", func(t *testing.T) {
		setServicesEnv(t, t.TempDir())
		t.Setenv("SCHIST_FRONTEND_URL", "http://[::1")
		_, err := services.NewServices()
		assert.ErrorContains(t, err, "failed to create passkey service")
	})
}

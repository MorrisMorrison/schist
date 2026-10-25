package services

import (
	stderrors "errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newHealthTestGitService(t *testing.T) (*GitService, string) {
	t.Helper()
	dir := t.TempDir()
	gs, err := NewGitService(dir)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "note.md"), []byte("# Note\n"), 0644))
	require.NoError(t, gs.CommitDocument("/note", "add note"))
	return gs, dir
}

func assertNoteSurvives(t *testing.T, dir string) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, "note.md"))
	require.NoError(t, err, "repair must never remove notes")
	assert.Equal(t, "# Note\n", string(data))
}

func TestGitService_HealthCheck(t *testing.T) {
	t.Run("healthy repository", func(t *testing.T) {
		gs, _ := newHealthTestGitService(t)
		assert.NoError(t, gs.HealthCheck())
		assert.NoError(t, gs.HealthCheckWithRepair(true))
		assert.NoError(t, gs.RepairRepository())
	})

	t.Run("nil repository", func(t *testing.T) {
		gs, dir := newHealthTestGitService(t)
		gs.repository = nil
		assert.ErrorContains(t, gs.HealthCheck(), "not initialized")

		require.NoError(t, gs.HealthCheckWithRepair(true))
		assert.NotNil(t, gs.repository)
		assertNoteSurvives(t, dir)
		versions, err := gs.GetDocumentVersions("/note")
		require.NoError(t, err)
		assert.Len(t, versions, 1, "reopening keeps the existing history")
	})

	t.Run("missing .git directory is reinitialised", func(t *testing.T) {
		gs, dir := newHealthTestGitService(t)
		require.NoError(t, os.RemoveAll(filepath.Join(dir, ".git")))
		assert.ErrorContains(t, gs.HealthCheck(), ".git directory not found")

		require.NoError(t, gs.HealthCheckWithRepair(true))
		assertNoteSurvives(t, dir)
		_, err := os.Stat(filepath.Join(dir, ".git"))
		assert.NoError(t, err)
		gitignore, err := os.ReadFile(filepath.Join(dir, ".gitignore"))
		require.NoError(t, err)
		assert.Contains(t, string(gitignore), appStateIgnoreRule)
	})

	t.Run("RepairRepository directly reinitialises a missing .git", func(t *testing.T) {
		gs, dir := newHealthTestGitService(t)
		require.NoError(t, os.RemoveAll(filepath.Join(dir, ".git")))
		require.NoError(t, gs.RepairRepository())
		assert.NoError(t, gs.HealthCheck())
		assertNoteSurvives(t, dir)

		gs.repository = nil
		require.NoError(t, gs.RepairRepository())
		assert.NoError(t, gs.HealthCheck())
	})

	t.Run("corrupt config is reported, not wiped", func(t *testing.T) {
		gs, dir := newHealthTestGitService(t)
		configPath := filepath.Join(dir, ".git", "config")
		require.NoError(t, os.WriteFile(configPath, []byte("[core\nnot a config"), 0644))

		assert.ErrorContains(t, gs.HealthCheck(), "config is invalid")
		assert.ErrorContains(t, gs.HealthCheckWithRepair(true), "config is invalid")
		assertNoteSurvives(t, dir)
		data, err := os.ReadFile(configPath)
		require.NoError(t, err)
		assert.Equal(t, "[core\nnot a config", string(data), "repair must not replace a repository it cannot read")
	})

	t.Run("corrupt index is reported, not wiped", func(t *testing.T) {
		gs, dir := newHealthTestGitService(t)
		require.NoError(t, os.WriteFile(filepath.Join(dir, ".git", "index"), []byte("garbage"), 0644))

		assert.ErrorContains(t, gs.HealthCheck(), "status check failed")
		assert.Error(t, gs.HealthCheckWithRepair(true))
		assertNoteSurvives(t, dir)
		_, err := os.Stat(filepath.Join(dir, ".git", "HEAD"))
		assert.NoError(t, err, "the repository must not be deleted")
	})

	t.Run("repair attempts are bounded", func(t *testing.T) {
		gs, dir := newHealthTestGitService(t)
		gs.repository = nil
		assert.ErrorContains(t, gs.healthCheckWithRepairAttempts(true, maxRepairAttempts), "maximum repair attempts")

		gs, dir = newHealthTestGitService(t)
		require.NoError(t, os.RemoveAll(filepath.Join(dir, ".git")))
		assert.ErrorContains(t, gs.healthCheckWithRepairAttempts(true, maxRepairAttempts), "maximum repair attempts")

		gs, dir = newHealthTestGitService(t)
		require.NoError(t, os.WriteFile(filepath.Join(dir, ".git", "config"), []byte("[core"), 0644))
		assert.ErrorContains(t, gs.healthCheckWithRepairAttempts(true, maxRepairAttempts), "maximum repair attempts")

		gs, dir = newHealthTestGitService(t)
		require.NoError(t, os.WriteFile(filepath.Join(dir, ".git", "index"), []byte("garbage"), 0644))
		assert.ErrorContains(t, gs.healthCheckWithRepairAttempts(true, maxRepairAttempts), "maximum repair attempts")
	})
}

func TestGitService_UninitialisedRepository(t *testing.T) {
	gs := &GitService{dataDir: t.TempDir()}
	const hash = "0123456789abcdef0123456789abcdef01234567"

	_, err := gs.CommitPendingChanges("m")
	assert.ErrorContains(t, err, "not initialized")
	assert.ErrorContains(t, gs.CommitDocuments("m", "/a"), "not initialized")
	_, err = gs.GetDocumentVersions("/a")
	assert.ErrorContains(t, err, "not initialized")
	_, err = gs.GetDocumentAtVersion("/a", hash)
	assert.ErrorContains(t, err, "not initialized")
	_, err = gs.CompareVersions("/a", hash, hash)
	assert.ErrorContains(t, err, "not initialized")
	assert.ErrorContains(t, gs.RestoreDocument("/a", hash), "not initialized")
}

func TestGitService_CommitDocumentsNeedsPaths(t *testing.T) {
	gs, _ := newHealthTestGitService(t)
	assert.ErrorContains(t, gs.CommitDocuments("m"), "no documents")
}

func TestGitService_CommitDocumentsDefaultMessage(t *testing.T) {
	gs, dir := newHealthTestGitService(t)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "other.md"), []byte("# Other\n"), 0644))
	require.NoError(t, gs.CommitDocuments("", "/other"))

	versions, err := gs.GetDocumentVersions("/other")
	require.NoError(t, err)
	require.Len(t, versions, 1)
	assert.Equal(t, "Update document: /other", versions[0].Message)
}

func TestNewGitService_DataDirIsAFile(t *testing.T) {
	file := filepath.Join(t.TempDir(), "data")
	require.NoError(t, os.WriteFile(file, []byte("x"), 0644))
	gs, err := NewGitService(file)
	assert.Error(t, err)
	assert.Nil(t, gs)
}

func TestGitService_EnsureAppStateIgnored(t *testing.T) {
	tests := []struct {
		name        string
		gitignore   *string
		wantChanged bool
		want        string
	}{
		{"missing file is created", nil, true, ".schist/\n"},
		{"appends with a separating newline", strPtr("*.tmp"), true, "*.tmp\n.schist/\n"},
		{"appends after a trailing newline", strPtr("*.tmp\n"), true, "*.tmp\n.schist/\n"},
		{"already ignored", strPtr("*.tmp\n.schist/\n"), false, "*.tmp\n.schist/\n"},
		{"already ignored without slash", strPtr(".schist\n"), false, ".schist\n"},
		{"already ignored anchored", strPtr("/.schist/\n"), false, "/.schist/\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, ".gitignore")
			if tt.gitignore != nil {
				require.NoError(t, os.WriteFile(path, []byte(*tt.gitignore), 0644))
			}
			gs := &GitService{dataDir: dir}
			changed, err := gs.ensureAppStateIgnored()
			require.NoError(t, err)
			assert.Equal(t, tt.wantChanged, changed)
			data, err := os.ReadFile(path)
			require.NoError(t, err)
			assert.Equal(t, tt.want, string(data))
		})
	}

	t.Run("unreadable .gitignore", func(t *testing.T) {
		dir := t.TempDir()
		require.NoError(t, os.Mkdir(filepath.Join(dir, ".gitignore"), 0755))
		_, err := (&GitService{dataDir: dir}).ensureAppStateIgnored()
		assert.Error(t, err)
	})
}

func strPtr(s string) *string { return &s }

func TestIsAppStatePath(t *testing.T) {
	for path, want := range map[string]bool{
		".schist":             true,
		".schist/config.json": true,
		"users.json":          true,
		"invites/abc.json":    true,
		"notes/users.json":    false,
		"invites.md":          false,
		".schistx/a.md":       false,
		"note.md":             false,
	} {
		assert.Equal(t, want, isAppStatePath(path), path)
	}
}

func TestClassifyVersionLookupError(t *testing.T) {
	other := stderrors.New("disk on fire")
	err := classifyVersionLookupError("abc", "lookup", other)
	assert.ErrorIs(t, err, other)
	var notFound *VersionNotFoundError
	assert.False(t, stderrors.As(err, &notFound))
	assert.True(t, strings.HasPrefix(err.Error(), "lookup: "))
}

func TestGitService_ComputeDiffCountsLines(t *testing.T) {
	gs := &GitService{}
	diff := gs.computeDiff("/a", "h1", "h2", "one\ntwo\nthree\n", "one\n2\nthree\nfour\n")
	assert.Equal(t, "/a", diff.DocumentPath)
	assert.Positive(t, diff.Summary.Additions)
	assert.Positive(t, diff.Summary.Deletions)
	for _, line := range diff.Lines {
		assert.NotContains(t, line.Content, "\n")
	}
	assert.Equal(t, ChangeTypeContext, diff.Lines[0].Type)
	assert.Equal(t, "one", diff.Lines[0].Content)
}

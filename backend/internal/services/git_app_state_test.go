package services_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// headFiles lists every path in the HEAD commit of the repository at dir.
func headFiles(t *testing.T, dir string) []string {
	t.Helper()
	repo, err := git.PlainOpen(dir)
	require.NoError(t, err)
	ref, err := repo.Head()
	require.NoError(t, err)
	commit, err := repo.CommitObject(ref.Hash())
	require.NoError(t, err)
	tree, err := commit.Tree()
	require.NoError(t, err)

	var files []string
	require.NoError(t, tree.Files().ForEach(func(f *object.File) error {
		files = append(files, f.Name)
		return nil
	}))
	return files
}

func assertNoAppState(t *testing.T, files []string) {
	t.Helper()
	for _, f := range files {
		assert.False(t, strings.HasPrefix(f, ".schist/"), "app state %q must never be committed", f)
	}
}

func writeAppState(t *testing.T, dir string) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, ".schist"), 0755))
	for _, name := range []string{"passkeys.json", "shares.json", "users.json", "config.json"} {
		require.NoError(t, os.WriteFile(filepath.Join(dir, ".schist", name), []byte(`{"secret":"x"}`), 0600))
	}
}

func TestGitService_NewRepositoryIgnoresAppState(t *testing.T) {
	dir := t.TempDir()

	_, err := services.NewGitService(dir)
	require.NoError(t, err)

	gitignore, err := os.ReadFile(filepath.Join(dir, ".gitignore"))
	require.NoError(t, err)
	assert.Contains(t, strings.Split(string(gitignore), "\n"), ".schist/")
}

func TestGitService_UntracksAppStateInExistingRepository(t *testing.T) {
	dir := t.TempDir()

	// An existing data dir from before this fix: .schist/ committed and a
	// .gitignore without it.
	repo, err := git.PlainInit(dir, false)
	require.NoError(t, err)
	writeAppState(t, dir)
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".gitignore"), []byte("*.tmp\n"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "note.md"), []byte("# Note\n"), 0644))
	wt, err := repo.Worktree()
	require.NoError(t, err)
	require.NoError(t, wt.AddGlob("."))
	_, err = wt.Commit("old sync", &git.CommitOptions{
		Author: &object.Signature{Name: "t", Email: "t@example.com", When: time.Now()},
	})
	require.NoError(t, err)
	require.Contains(t, headFiles(t, dir), ".schist/passkeys.json", "precondition: app state tracked")

	_, err = services.NewGitService(dir)
	require.NoError(t, err)

	files := headFiles(t, dir)
	assertNoAppState(t, files)
	assert.Contains(t, files, "note.md", "notes stay tracked")
	assert.FileExists(t, filepath.Join(dir, ".schist", "passkeys.json"), "untracking must not delete the file")

	gitignore, err := os.ReadFile(filepath.Join(dir, ".gitignore"))
	require.NoError(t, err)
	assert.Contains(t, strings.Split(string(gitignore), "\n"), ".schist/")
	assert.Contains(t, string(gitignore), "*.tmp", "existing ignore rules are kept")

	// Opening again is a no-op: no extra commit.
	before, err := repo.Head()
	require.NoError(t, err)
	_, err = services.NewGitService(dir)
	require.NoError(t, err)
	after, err := repo.Head()
	require.NoError(t, err)
	assert.Equal(t, before.Hash(), after.Hash())
}

func TestGitService_CommitPendingChangesSkipsAppState(t *testing.T) {
	dir := t.TempDir()
	gs, err := services.NewGitService(dir)
	require.NoError(t, err)

	// Even if the user's .gitignore loses the rule, app state stays out.
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".gitignore"), []byte("*.tmp\n"), 0644))
	writeAppState(t, dir)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "projects"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "projects", "plan.md"), []byte("# Plan\n"), 0644))

	committed, err := gs.CommitPendingChanges("Sync")
	require.NoError(t, err)
	assert.True(t, committed)

	files := headFiles(t, dir)
	assertNoAppState(t, files)
	assert.Contains(t, files, "projects/plan.md")
	assert.Contains(t, files, ".gitignore")

	// Only app state left changed: nothing to commit.
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".schist", "shares.json"), []byte(`{"changed":true}`), 0600))
	committed, err = gs.CommitPendingChanges("Sync")
	require.NoError(t, err)
	assert.False(t, committed)
}

func TestGitService_CommitPendingChangesStagesDeletions(t *testing.T) {
	dir := t.TempDir()
	gs, err := services.NewGitService(dir)
	require.NoError(t, err)

	require.NoError(t, os.WriteFile(filepath.Join(dir, "gone.md"), []byte("# Gone\n"), 0644))
	_, err = gs.CommitPendingChanges("add")
	require.NoError(t, err)
	require.Contains(t, headFiles(t, dir), "gone.md")

	require.NoError(t, os.Remove(filepath.Join(dir, "gone.md")))
	committed, err := gs.CommitPendingChanges("remove")
	require.NoError(t, err)
	assert.True(t, committed)
	assert.NotContains(t, headFiles(t, dir), "gone.md")
}

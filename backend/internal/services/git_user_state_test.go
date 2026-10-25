package services_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/services"
)

// UserService keeps users.json and invites/ in the data dir root, next to the
// notes. GitHub sync commits everything pending, so these must be treated as
// app state just like .schist/: an unexpired invite token pushed to the backup
// repository is a working sign-up link for anyone who can read it.
func TestGitService_CommitPendingChangesSkipsUserState(t *testing.T) {
	dir := t.TempDir()
	gs, err := services.NewGitService(dir)
	require.NoError(t, err)

	us := services.NewUserService(dir)
	require.NoError(t, us.CreateFirstUser("admin", "cred-1"))
	_, err = us.GenerateInviteToken("admin")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "note.md"), []byte("# Note\n"), 0644))

	committed, err := gs.CommitPendingChanges("sync")
	require.NoError(t, err)
	require.True(t, committed)

	files := headFiles(t, dir)
	assert.Contains(t, files, "note.md")
	for _, f := range files {
		assert.NotEqual(t, "users.json", f, "users.json must never be committed")
		assert.False(t, strings.HasPrefix(f, "invites/"), "invite %q must never be committed", f)
	}
}

func TestGitService_UntracksCommittedUserStateOnOpen(t *testing.T) {
	dir := t.TempDir()

	// A data dir whose users.json and an invite were committed by an earlier
	// sync, before they counted as app state.
	repo, err := git.PlainInit(dir, false)
	require.NoError(t, err)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "invites"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "users.json"), []byte(`{"users":[]}`), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "invites", "tok.json"), []byte(`{}`), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".gitignore"), []byte(".schist/\n"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "note.md"), []byte("# Note\n"), 0644))
	wt, err := repo.Worktree()
	require.NoError(t, err)
	require.NoError(t, wt.AddGlob("."))
	_, err = wt.Commit("old sync", &git.CommitOptions{
		Author: &object.Signature{Name: "t", Email: "t@example.com", When: time.Now()},
	})
	require.NoError(t, err)
	require.Contains(t, headFiles(t, dir), "users.json", "precondition: user state tracked")

	_, err = services.NewGitService(dir)
	require.NoError(t, err)

	files := headFiles(t, dir)
	assert.Contains(t, files, "note.md")
	assert.NotContains(t, files, "users.json")
	assert.NotContains(t, files, "invites/tok.json")
	_, err = os.Stat(filepath.Join(dir, "users.json"))
	assert.NoError(t, err, "untracking must leave the file on disk")
}

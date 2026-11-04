package services

import (
	stderrors "errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	appconfig "github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/syncplan"
)

// obsidianClone clones the bare remote into a temp dir (via the installed
// https transport) and returns a func that writes files and pushes them, the
// way Obsidian's git plugin would.
func obsidianClone(t *testing.T) (dir string, commitAndPush func(files map[string]string, deletes ...string)) {
	t.Helper()
	dir = t.TempDir()
	repo, err := git.PlainClone(dir, false, &git.CloneOptions{
		URL: "https://github.com/" + testOwner + "/" + testRepo + ".git", ReferenceName: "refs/heads/main",
	})
	require.NoError(t, err)
	wt, err := repo.Worktree()
	require.NoError(t, err)
	return dir, func(files map[string]string, deletes ...string) {
		if err := wt.Pull(&git.PullOptions{RemoteName: "origin", ReferenceName: "refs/heads/main"}); err != nil && !stderrors.Is(err, git.NoErrAlreadyUpToDate) {
			require.NoError(t, err)
		}
		for name, content := range files {
			require.NoError(t, os.MkdirAll(filepath.Dir(filepath.Join(dir, name)), 0o755))
			require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644))
			_, err := wt.Add(name)
			require.NoError(t, err)
		}
		for _, name := range deletes {
			_, err := wt.Remove(name)
			require.NoError(t, err)
		}
		_, err := wt.Commit("obsidian", &git.CommitOptions{Author: &object.Signature{Name: "o", Email: "o@x", When: time.Now()}})
		require.NoError(t, err)
		require.NoError(t, repo.Push(&git.PushOptions{}))
	}
}

// twoWayFixture: a wiki with one synced page, the remote at the same commit,
// and two-way mode on.
func twoWayFixture(t *testing.T) (*githubFixture, string) {
	t.Helper()
	gh := enabledSettings()
	gh.Mode = appconfig.GitHubModeTwoWay
	f := newGitHubFixture(t, gh)
	unlockForTest(t, f.secrets)
	remoteDir := installLocalRemote(t, testOwner, testRepo)
	writeNote(t, f.dataDir, "plan.md", page("Plan", "v1"))
	writeNote(t, f.dataDir, "notes.md", page("Notes", "n1"))
	_, err := f.gs.SyncToGitHub()
	require.NoError(t, err)
	return f, remoteDir
}

func page(title, body string) string {
	return "---\ntitle: " + title + "\npath: /" + strings.ToLower(title) + "\n---\n# " + title + "\n\n" + body + "\n"
}

// assertCleanWorktree fails when the working tree differs from HEAD, apart
// from the app state Schist keeps out of git.
func assertCleanWorktree(t *testing.T, f *githubFixture) {
	t.Helper()
	wt, err := f.gs.gitService.repository.Worktree()
	require.NoError(t, err)
	status, err := wt.Status()
	require.NoError(t, err)
	for path, s := range status {
		if isAppStatePath(path) {
			continue
		}
		assert.Failf(t, "worktree not clean", "%s: staging=%c worktree=%c", path, s.Staging, s.Worktree)
	}
}

func TestPull_FastForwardBringsObsidianEdits(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "from obsidian"), "new.md": page("New", "x")})

	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"plan.md", "new.md"}, out.Applied)
	got, _ := os.ReadFile(filepath.Join(f.dataDir, "plan.md"))
	assert.Contains(t, string(got), "from obsidian")
	head, _ := f.gs.gitService.repository.Head()
	assert.Equal(t, out.RemoteHead, head.Hash(), "fast-forward: HEAD is the remote commit")
	assertCleanWorktree(t, f)
}

func TestPull_FastForwardAppliesDeletions(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(nil, "notes.md")

	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	assert.Equal(t, []string{"notes.md"}, out.Applied)
	_, statErr := os.Stat(filepath.Join(f.dataDir, "notes.md"))
	assert.True(t, os.IsNotExist(statErr))
	assertCleanWorktree(t, f)
}

func TestPull_DifferentPagesMergeWithBothParents(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "from obsidian")})
	writeNote(t, f.dataDir, "notes.md", page("Notes", "from schist"))
	_, err := f.gs.gitService.CommitPendingChanges("local edit")
	require.NoError(t, err)

	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	assert.Equal(t, []string{"plan.md"}, out.Applied)
	head, _ := f.gs.gitService.repository.Head()
	commit, _ := f.gs.gitService.repository.CommitObject(head.Hash())
	assert.Len(t, commit.ParentHashes, 2, "a merge commit")
	notes, _ := os.ReadFile(filepath.Join(f.dataDir, "notes.md"))
	assert.Contains(t, string(notes), "from schist", "local edit kept")
	assertCleanWorktree(t, f)
}

func TestPull_SamePageBothSidesIsAConflictAndAppliesNothing(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian"), "other.md": page("Other", "o")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))
	_, err := f.gs.gitService.CommitPendingChanges("local edit")
	require.NoError(t, err)
	before, _ := f.gs.gitService.repository.Head()

	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	assert.Equal(t, []string{"plan.md"}, out.Conflicts)
	assert.Empty(t, out.Applied, "no partial merge")
	after, _ := f.gs.gitService.repository.Head()
	assert.Equal(t, before.Hash(), after.Hash())
	_, statErr := os.Stat(filepath.Join(f.dataDir, "other.md"))
	assert.True(t, os.IsNotExist(statErr))
}

func TestPull_ResolutionsApply(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))
	_, _ = f.gs.gitService.CommitPendingChanges("local edit")
	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	require.Equal(t, []string{"plan.md"}, out.Conflicts)

	blob := remoteBlob(t, f, out.RemoteHead, "plan.md")
	out, _, err = f.gs.pullOnce(map[string]syncplan.Resolution{
		"plan.md": {Side: syncplan.SideRemote, RemoteBlob: blob},
	}, false)
	require.NoError(t, err)
	assert.Empty(t, out.Conflicts)
	got, _ := os.ReadFile(filepath.Join(f.dataDir, "plan.md"))
	assert.Contains(t, string(got), "obsidian")
	assertCleanWorktree(t, f)
}

func TestPull_KeepingLocalStillRecordsTheMerge(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))
	_, _ = f.gs.gitService.CommitPendingChanges("local edit")
	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)

	blob := remoteBlob(t, f, out.RemoteHead, "plan.md")
	out, _, err = f.gs.pullOnce(map[string]syncplan.Resolution{
		"plan.md": {Side: syncplan.SideLocal, RemoteBlob: blob},
	}, false)
	require.NoError(t, err)
	assert.Empty(t, out.Conflicts)
	got, _ := os.ReadFile(filepath.Join(f.dataDir, "plan.md"))
	assert.Contains(t, string(got), "schist")
	head, _ := f.gs.gitService.repository.Head()
	commit, _ := f.gs.gitService.repository.CommitObject(head.Hash())
	assert.Contains(t, commit.ParentHashes, out.RemoteHead, "the remote is now in local history")
	assertCleanWorktree(t, f)
}

func TestPull_FileChangedOnDiskSinceThePlanAborts(t *testing.T) {
	// The on-disk check: a write that bypassed the lock (MCP) is never overwritten.
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	f.gs.beforeApply = func() { writeNote(t, f.dataDir, "plan.md", page("Plan", "mcp edit")) }

	_, _, err := f.gs.pullOnce(nil, false)
	assert.ErrorIs(t, err, errHeadMoved)
	got, _ := os.ReadFile(filepath.Join(f.dataDir, "plan.md"))
	assert.Contains(t, string(got), "mcp edit")
}

func TestPull_UnreadableNotesAreListed(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"My Note.md": "just text, no front matter\n"})

	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	assert.Equal(t, []string{"My Note.md"}, out.Unreadable)
	_, statErr := os.Stat(filepath.Join(f.dataDir, "My Note.md"))
	assert.NoError(t, statErr, "carried along on disk")
}

func remoteBlob(t *testing.T, f *githubFixture, head plumbing.Hash, path string) string {
	t.Helper()
	tree, err := commitTree(f.gs.gitService.repository, head)
	require.NoError(t, err)
	return tree[path]
}

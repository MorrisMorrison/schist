package services

import (
	stderrors "errors"
	"fmt"
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
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
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
	before, _ := f.gs.gitService.repository.Head()

	_, _, err := f.gs.pullOnce(nil, false)
	assert.ErrorIs(t, err, errHeadMoved)
	got, _ := os.ReadFile(filepath.Join(f.dataDir, "plan.md"))
	assert.Contains(t, string(got), "mcp edit")
	after, _ := f.gs.gitService.repository.Head()
	assert.Equal(t, before.Hash(), after.Hash(), "nothing recorded")
}

func TestPull_ChecksAndApplyHoldTheCommitLock(t *testing.T) {
	// Writers that skip the write lock still commit under commitMu; holding
	// it from the HEAD check to our commit keeps their commits out of the gap.
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	held := false
	f.gs.beforeApply = func() {
		held = !f.gs.gitService.commitMu.TryLock()
		if !held {
			f.gs.gitService.commitMu.Unlock()
		}
	}

	_, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	assert.True(t, held, "commitMu is held before the HEAD and on-disk checks")
}

func TestPull_DryRunTouchesNothing(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian"), "new.md": page("New", "x")})
	before, _ := f.gs.gitService.repository.Head()

	out, plan, err := f.gs.pullOnce(nil, true)
	require.NoError(t, err)
	var paths []string
	for _, c := range plan.Apply {
		paths = append(paths, c.Path)
	}
	assert.ElementsMatch(t, []string{"plan.md", "new.md"}, paths, "the plan is reported")
	assert.Empty(t, out.Applied)
	after, _ := f.gs.gitService.repository.Head()
	assert.Equal(t, before.Hash(), after.Hash())
	got, _ := os.ReadFile(filepath.Join(f.dataDir, "plan.md"))
	assert.Contains(t, string(got), "v1")
	_, statErr := os.Stat(filepath.Join(f.dataDir, "new.md"))
	assert.True(t, os.IsNotExist(statErr))
	assertCleanWorktree(t, f)
}

func TestPull_IgnoredLocalFileInTheWayNamesThePath(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"scratch.md": page("Scratch", "from obsidian")})
	gitignore := filepath.Join(f.dataDir, ".gitignore")
	existing, err := os.ReadFile(gitignore)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(gitignore, append(existing, []byte("\nscratch.md\n")...), 0o644))
	writeNote(t, f.dataDir, "scratch.md", "local scratch\n")
	_, err = f.gs.gitService.CommitPendingChanges("ignore scratch")
	require.NoError(t, err)

	_, _, err = f.gs.pullOnce(nil, false)
	require.Error(t, err)
	assert.ErrorIs(t, err, errIgnoredFileInTheWay)
	assert.NotErrorIs(t, err, errHeadMoved, "planning again would never help")
	assert.Contains(t, err.Error(), "scratch.md")
	got, _ := os.ReadFile(filepath.Join(f.dataDir, "scratch.md"))
	assert.Equal(t, "local scratch\n", string(got))
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

func TestSync_TwoWayPausesThenResumesWithResolutions(t *testing.T) {
	f, remoteDir := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))

	_, err := f.gs.SyncToGitHub()
	assert.Equal(t, apierrors.ErrCodeSyncConflict, errorCode(err))
	s := f.settings.GetGitHubSettings()
	assert.Equal(t, []string{"plan.md"}, s.SyncConflicts)
	require.NotEmpty(t, s.PausedRemoteHead)

	_, err = f.gs.Sync(GitHubSyncOptions{
		Resolutions: map[string]string{"plan.md": "local"}, RemoteHead: s.PausedRemoteHead,
	})
	require.NoError(t, err)
	s = f.settings.GetGitHubSettings()
	assert.Empty(t, s.SyncConflicts)
	assert.Empty(t, s.PausedRemoteHead)
	head, _ := f.gs.gitService.repository.Head()
	assert.Equal(t, head.Hash(), remoteBranchHash(t, remoteDir, "main"), "pushed")
	assert.Equal(t, page("Plan", "schist"), remoteFileContent(t, remoteDir, "main", "plan.md"), "local side won")
}

func remoteFileContent(t *testing.T, remoteDir, branch, path string) string {
	t.Helper()
	repo, err := git.PlainOpen(remoteDir)
	require.NoError(t, err)
	commit, err := repo.CommitObject(remoteBranchHash(t, remoteDir, branch))
	require.NoError(t, err)
	file, err := commit.File(path)
	require.NoError(t, err)
	content, err := file.Contents()
	require.NoError(t, err)
	return content
}

func TestSync_TwoWayIgnoredFileInTheWayIsAnInvalidStateNamingThePath(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"scratch.md": page("Scratch", "from obsidian")})
	gitignore := filepath.Join(f.dataDir, ".gitignore")
	existing, err := os.ReadFile(gitignore)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(gitignore, append(existing, []byte("\nscratch.md\n")...), 0o644))
	writeNote(t, f.dataDir, "scratch.md", "local scratch\n")

	_, err = f.gs.SyncToGitHub()
	assert.Equal(t, apierrors.ErrCodeInvalidState, errorCode(err))
	s := f.settings.GetGitHubSettings()
	assert.Contains(t, s.LastSyncError, "scratch.md")
	assert.Equal(t, string(apierrors.ErrCodeInvalidState), s.LastSyncErrorCode)
}

func TestSync_TwoWayReplaceRemoteClearsThePause(t *testing.T) {
	f, _ := twoWayFixture(t)
	require.NoError(t, f.settings.Update(f.dataDir, func(st *appconfig.Settings) error {
		st.GitHub.SyncConflicts = []string{"plan.md"}
		st.GitHub.PausedRemoteHead = "0123456789abcdef0123456789abcdef01234567"
		return nil
	}))
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))

	_, err := f.gs.Sync(GitHubSyncOptions{ReplaceRemote: true})
	require.NoError(t, err)
	s := f.settings.GetGitHubSettings()
	assert.Empty(t, s.SyncConflicts)
	assert.Empty(t, s.PausedRemoteHead)
}

func TestSync_BackupModeUnchanged(t *testing.T) {
	f, _ := twoWayFixture(t)
	require.NoError(t, f.settings.Update(f.dataDir, func(st *appconfig.Settings) error {
		st.GitHub.Mode = ""
		return nil
	}))
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	writeNote(t, f.dataDir, "notes.md", page("Notes", "local"))

	_, err := f.gs.SyncToGitHub()
	assert.Equal(t, apierrors.ErrCodeSyncRemoteDiverged, errorCode(err))
}

func TestSync_TwoWayRetriesWhenTheRemoteMovesDuringPush(t *testing.T) {
	f, remoteDir := twoWayFixture(t)
	_, push := obsidianClone(t)
	moved := false
	f.gs.beforePush = func() {
		if !moved {
			moved = true
			push(map[string]string{"race.md": page("Race", "pushed meanwhile")})
		}
	}
	writeNote(t, f.dataDir, "notes.md", page("Notes", "local"))

	_, err := f.gs.SyncToGitHub()
	require.NoError(t, err)
	assert.Contains(t, remoteFiles(t, remoteDir, "main"), "race.md")
	_, statErr := os.Stat(filepath.Join(f.dataDir, "race.md"))
	assert.NoError(t, statErr)
}

func TestSync_TwoWayRetriesWhenTheRemoteMovesAfterThePushCheck(t *testing.T) {
	// Obsidian pushes between pushToGitHub's listing and the push itself, so
	// the push (not the listing) is what fails.
	f, remoteDir := twoWayFixture(t)
	_, push := obsidianClone(t)
	moved := false
	f.gs.beforePushRef = func() {
		if !moved {
			moved = true
			push(map[string]string{"race.md": page("Race", "pushed meanwhile")})
		}
	}
	writeNote(t, f.dataDir, "notes.md", page("Notes", "local"))

	_, err := f.gs.SyncToGitHub()
	require.NoError(t, err)
	assert.True(t, moved)
	assert.Contains(t, remoteFiles(t, remoteDir, "main"), "race.md")
	_, statErr := os.Stat(filepath.Join(f.dataDir, "race.md"))
	assert.NoError(t, statErr)
	head, _ := f.gs.gitService.repository.Head()
	assert.Equal(t, head.Hash(), remoteBranchHash(t, remoteDir, "main"), "pushed")
}

func TestSync_TwoWayGivesUpWhenTheWikiKeepsChanging(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	n := 0
	f.gs.beforeApply = func() {
		// Another page is committed each time, moving HEAD under the sync
		// (straight through go-git: the sync holds commitMu here).
		n++
		writeNote(t, f.dataDir, "busy.md", page("Busy", fmt.Sprintf("edit %d", n)))
		wt, err := f.gs.gitService.repository.Worktree()
		require.NoError(t, err)
		_, err = wt.Add("busy.md")
		require.NoError(t, err)
		_, err = wt.Commit("busy", &git.CommitOptions{Author: &object.Signature{Name: "b", Email: "b@x", When: time.Now()}})
		require.NoError(t, err)
	}

	_, err := f.gs.SyncToGitHub()
	require.Error(t, err)
	assert.Equal(t, maxTwoWayAttempts, n, "every attempt was used")
	assert.Equal(t, apierrors.ErrCodeConflict, errorCode(err))
	assert.Contains(t, err.Error(), "wiki kept changing")
	assert.NotContains(t, err.Error(), "GitHub")
}

func TestSync_ResolutionsNeedTheRemoteHeadTheyWereDecidedAgainst(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(nil, "plan.md") // edit vs delete: an empty decided tree would apply silently
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))
	_, err := f.gs.SyncToGitHub()
	require.Equal(t, apierrors.ErrCodeSyncConflict, errorCode(err))

	for _, head := range []string{"", plumbing.ZeroHash.String()} {
		_, err = f.gs.Sync(GitHubSyncOptions{Resolutions: map[string]string{"plan.md": "remote"}, RemoteHead: head})
		assert.Equal(t, apierrors.ErrCodeValidation, errorCode(err), "remote_head %q", head)
		assert.Contains(t, err.Error(), "remote_head")
	}
	_, statErr := os.Stat(filepath.Join(f.dataDir, "plan.md"))
	assert.NoError(t, statErr, "nothing applied")

	_, err = f.gs.Sync(GitHubSyncOptions{Resolutions: map[string]string{"plan.md": "remote"},
		RemoteHead: "0123456789abcdef0123456789abcdef01234567"})
	assert.Equal(t, apierrors.ErrCodeValidation, errorCode(err))
	assert.Contains(t, err.Error(), "fetched")
}

func TestSync_UnreadableListsEveryUnreadablePageUntilItIsGone(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"My Note.md": "just text\n"})

	_, err := f.gs.SyncToGitHub()
	require.NoError(t, err)
	assert.Equal(t, []string{"My Note.md"}, f.settings.GetGitHubSettings().Unreadable)

	_, err = f.gs.SyncToGitHub() // nothing new: still there, still unreadable
	require.NoError(t, err)
	assert.Equal(t, []string{"My Note.md"}, f.settings.GetGitHubSettings().Unreadable)

	push(nil, "My Note.md")
	_, err = f.gs.SyncToGitHub()
	require.NoError(t, err)
	assert.Empty(t, f.settings.GetGitHubSettings().Unreadable)
}

func TestSync_APauseKeepsTheUnreadableList(t *testing.T) {
	f, _ := twoWayFixture(t)
	require.NoError(t, f.settings.Update(f.dataDir, func(st *appconfig.Settings) error {
		st.GitHub.Unreadable = []string{"Old.md"}
		return nil
	}))
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian"), "My Note.md": "just text\n"})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))

	_, err := f.gs.SyncToGitHub()
	require.Equal(t, apierrors.ErrCodeSyncConflict, errorCode(err))
	assert.Equal(t, []string{"Old.md"}, f.settings.GetGitHubSettings().Unreadable, "the unapplied plan isn't reported")
}

func TestPreviewSync_ShowsWhatTheFirstSyncWouldDo(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian"), "new.md": page("New", "x")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))
	writeNote(t, f.dataDir, "mine.md", page("Mine", "m"))
	_, _ = f.gs.gitService.CommitPendingChanges("local")
	before, _ := f.gs.gitService.repository.Head()

	p, err := f.gs.PreviewSync()
	require.NoError(t, err)
	assert.Equal(t, []string{"new.md"}, p.Incoming)
	assert.Equal(t, []string{"mine.md"}, p.Outgoing)
	assert.Equal(t, []string{"plan.md"}, p.Conflicts)
	after, _ := f.gs.gitService.repository.Head()
	assert.Equal(t, before.Hash(), after.Hash(), "a preview changes nothing")
}

func TestConflictVersions_ReturnsBothSidesAndADiff(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))
	_, err := f.gs.SyncToGitHub()
	require.Error(t, err)

	v, err := f.gs.ConflictVersions("plan.md")
	require.NoError(t, err)
	assert.Contains(t, v.Local, "schist")
	assert.Contains(t, v.Remote, "obsidian")
	assert.NotNil(t, v.Diff)
}

func TestUpdateConfiguration_TwoWayTurnsOnAutoSync(t *testing.T) {
	t.Setenv("SCHIST_GITHUB_AUTO_SYNC_MINUTES", "")
	f := newGitHubFixture(t, enabledSettings())
	mode := "two-way"
	require.NoError(t, f.gs.UpdateConfiguration(&GitHubConfigRequest{Mode: &mode}))
	s := f.settings.GetGitHubSettings()
	assert.True(t, s.TwoWay())
	assert.True(t, s.AutoSync)
	assert.Equal(t, 5*time.Minute, f.gs.autoSyncInterval())

	bad := "sideways"
	assert.Error(t, f.gs.UpdateConfiguration(&GitHubConfigRequest{Mode: &bad}))
}

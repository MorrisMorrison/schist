package services

import (
	"context"
	stderrors "errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"time"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	githttp "github.com/go-git/go-git/v5/plumbing/transport/http"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/serializer"
	"github.com/MorrisMorrison/schist/internal/syncplan"
	"github.com/MorrisMorrison/schist/internal/utils"
)

// errHeadMoved means the wiki changed while a sync was applying; plan again.
var errHeadMoved = stderrors.New("local history moved during the sync")

// errIgnoredFileInTheWay means GitHub has a file at a path where the wiki
// folder holds a file git ignores; it must be moved before the pull can apply.
var errIgnoredFileInTheWay = stderrors.New("a file ignored by git is in the way of a file from GitHub; move it out of the wiki folder")

// pullOutcome is what one pull did, or would do (dry run).
type pullOutcome struct {
	RemoteHead plumbing.Hash
	Applied    []string // paths written or deleted
	Conflicts  []string
	Unreadable []string
}

// pathIgnore applies the fixed ignore patterns (they don't depend on the data dir).
var pathIgnore = NewIgnoreService("")

// isPagePath reports whether a repository path is a wiki page: a .md file
// outside the folders Schist doesn't show (trash, assets, .obsidian...).
func isPagePath(p string) bool {
	return strings.HasSuffix(p, ".md") && !pathIgnore.ShouldIgnore("/"+p)
}

// remoteTrackingRef is where the fetched remote branch is kept.
func remoteTrackingRef(branch string) plumbing.ReferenceName {
	return plumbing.NewRemoteReferenceName("origin", branch)
}

// fetchRemote fetches the branch and returns its head, or the zero hash when
// the branch (or the repository) is empty.
func (gs *GitHubService) fetchRemote(repo *git.Repository) (plumbing.Hash, error) {
	s := gs.settings.GetGitHubSettings()
	token, err := gs.getToken()
	if err != nil {
		return plumbing.ZeroHash, fmt.Errorf("failed to get GitHub token: %w", err)
	}
	auth := &githttp.BasicAuth{Username: s.Owner, Password: token}
	ctx, cancel := context.WithTimeout(gs.ctx, githubPushTimeout)
	defer cancel()

	remote, err := repo.Remote("origin")
	if err != nil {
		return plumbing.ZeroHash, fmt.Errorf("failed to get remote: %w", err)
	}
	head, err := remoteBranchHead(ctx, remote, auth, s.Branch)
	if err != nil {
		return plumbing.ZeroHash, gitTransportError(err, s)
	}
	if head.IsZero() {
		return plumbing.ZeroHash, nil
	}
	spec := config.RefSpec(fmt.Sprintf("+refs/heads/%s:%s", s.Branch, remoteTrackingRef(s.Branch)))
	err = repo.FetchContext(ctx, &git.FetchOptions{RemoteName: "origin", RefSpecs: []config.RefSpec{spec}, Auth: auth})
	if err != nil && !stderrors.Is(err, git.NoErrAlreadyUpToDate) {
		return plumbing.ZeroHash, gitTransportError(err, s)
	}
	return head, nil
}

// commitTree lists a commit's files (path -> blob hash), leaving out the app
// state; the zero hash is the empty tree.
func commitTree(repo *git.Repository, h plumbing.Hash) (syncplan.Tree, error) {
	out := syncplan.Tree{}
	if h.IsZero() {
		return out, nil
	}
	commit, err := repo.CommitObject(h)
	if err != nil {
		return nil, err
	}
	tree, err := commit.Tree()
	if err != nil {
		return nil, err
	}
	err = tree.Files().ForEach(func(f *object.File) error {
		if !isAppStatePath(f.Name) {
			out[f.Name] = f.Hash.String()
		}
		return nil
	})
	return out, err
}

// mergeBase is the newest commit both histories share (zero when none, so
// unrelated histories are planned against the empty tree).
func mergeBase(repo *git.Repository, a, b plumbing.Hash) (plumbing.Hash, error) {
	ca, err := repo.CommitObject(a)
	if err != nil {
		return plumbing.ZeroHash, err
	}
	cb, err := repo.CommitObject(b)
	if err != nil {
		return plumbing.ZeroHash, err
	}
	bases, err := ca.MergeBase(cb)
	if err != nil || len(bases) == 0 {
		return plumbing.ZeroHash, err
	}
	return bases[0].Hash, nil
}

// pullOnce brings the remote branch into the wiki: a fast-forward, a merge of
// changes on different pages, or (with conflicts) nothing. dryRun plans
// without touching the working tree. It returns errHeadMoved when the wiki
// changed meanwhile; the caller plans again.
func (gs *GitHubService) pullOnce(resolutions map[string]syncplan.Resolution, dryRun bool) (*pullOutcome, *syncplan.Result, error) {
	repo, err := gs.localRepository()
	if err != nil {
		return nil, nil, err
	}
	remoteHead, err := gs.fetchRemote(repo)
	if err != nil {
		return nil, nil, err
	}
	out := &pullOutcome{RemoteHead: remoteHead}
	head, err := repo.Head()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get HEAD: %w", err)
	}
	local := head.Hash()
	if remoteHead.IsZero() || remoteHead == local {
		return out, &syncplan.Result{}, nil
	}
	behind, err := isAncestorCommit(repo, remoteHead, local)
	if err != nil {
		return nil, nil, err
	}
	if behind {
		return out, &syncplan.Result{}, nil // the remote is already in local history
	}

	fastForward, err := isAncestorCommit(repo, local, remoteHead)
	if err != nil {
		return nil, nil, err
	}
	base := local
	if !fastForward {
		if base, err = mergeBase(repo, local, remoteHead); err != nil {
			return nil, nil, err
		}
	}
	trees := make([]syncplan.Tree, 3)
	for i, h := range []plumbing.Hash{base, local, remoteHead} {
		if trees[i], err = commitTree(repo, h); err != nil {
			return nil, nil, err
		}
	}
	plan := syncplan.Plan(trees[0], trees[1], trees[2], isPagePath)
	if len(resolutions) > 0 {
		plan, _ = syncplan.Resolve(plan, trees[2], resolutions)
	}
	out.Conflicts = plan.Conflicts
	out.Unreadable = unreadablePages(repo, plan.Apply)
	if dryRun || len(plan.Conflicts) > 0 {
		return out, &plan, nil
	}
	if err := gs.applyPlan(repo, plan, local, remoteHead, fastForward, trees[1]); err != nil {
		return nil, nil, err
	}
	for _, c := range plan.Apply {
		out.Applied = append(out.Applied, c.Path)
	}
	gs.notifyPulled(out.Applied, out.Unreadable)
	return out, &plan, nil
}

// applyPlan writes the plan into the working tree and records it: the branch
// moves to the remote head (fast-forward) or gets a merge commit with both
// heads as parents. It runs under the wiki's write lock and refuses (with
// errHeadMoved) when the wiki changed since the plan was made.
func (gs *GitHubService) applyPlan(repo *git.Repository, plan syncplan.Result, local, remote plumbing.Hash,
	fastForward bool, localTree syncplan.Tree) error {
	unlock := gs.gitService.LockWrites()
	defer unlock()

	// Uncommitted edits would otherwise be lost by the fast-forward's index
	// reset or folded into the merge; committing them moves HEAD, so plan again.
	if committed, err := gs.gitService.CommitPendingChanges("Sync: commit changes before pulling from GitHub"); err != nil {
		return err
	} else if committed {
		return errHeadMoved
	}
	// From here until the commit or reset, hold commitMu: writers that skip
	// writeMu (MCP, imports, moves) still commit through it, so no commit can
	// land between the checks below and ours. Nothing below takes it again.
	gs.gitService.commitMu.Lock()
	defer gs.gitService.commitMu.Unlock()
	if gs.beforeApply != nil {
		gs.beforeApply()
	}
	if head, err := repo.Head(); err != nil || head.Hash() != local {
		return errHeadMoved
	}
	wt, err := repo.Worktree()
	if err != nil {
		return err
	}
	dataDir := gs.gitService.dataDir
	for _, c := range plan.Apply {
		full := filepath.Join(dataDir, filepath.FromSlash(c.Path))
		if !changedOnDisk(full, localTree[c.Path]) {
			continue
		}
		if _, tracked := localTree[c.Path]; !tracked && gitIgnores(wt, c.Path) {
			// CommitPendingChanges can't pick it up, so planning again
			// would never help.
			return fmt.Errorf("%w: %s", errIgnoredFileInTheWay, c.Path)
		}
		return errHeadMoved
	}

	for _, c := range plan.Apply {
		full := filepath.Join(dataDir, filepath.FromSlash(c.Path))
		if c.Delete {
			// Remove deletes the file and stages the deletion.
			if _, err := wt.Remove(c.Path); err != nil {
				return fmt.Errorf("failed to stage deletion of %s: %w", c.Path, err)
			}
			continue
		}
		data, err := blobBytes(repo, c.Blob)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(full, data, 0o644); err != nil {
			return err
		}
		if _, err := wt.Add(c.Path); err != nil {
			return fmt.Errorf("failed to stage %s: %w", c.Path, err)
		}
	}
	if fastForward {
		// Move the branch and rebuild the index from the remote commit; the
		// working tree already matches it.
		return wt.Reset(&git.ResetOptions{Commit: remote, Mode: git.MixedReset})
	}
	author := syncAuthor
	author.When = time.Now()
	_, err = wt.Commit("Sync: merge changes from GitHub", &git.CommitOptions{
		Author:  &author,
		Parents: []plumbing.Hash{local, remote},
		// Keeping every local version leaves the tree unchanged, but the merge
		// still has to record that the remote is now part of local history.
		AllowEmptyCommits: true,
	})
	return err
}

// gitIgnores reports whether an untracked file on disk is one git ignores
// (an untracked file git sees shows up in the status; an ignored one doesn't).
func gitIgnores(wt *git.Worktree, path string) bool {
	status, err := wt.Status()
	if err != nil {
		return false
	}
	_, seen := status[path]
	return !seen
}

// changedOnDisk reports whether the file no longer matches the blob the plan
// assumed (want "" = absent).
func changedOnDisk(full, want string) bool {
	data, err := os.ReadFile(full)
	if os.IsNotExist(err) {
		return want != ""
	}
	if err != nil {
		return true
	}
	return plumbing.ComputeHash(plumbing.BlobObject, data).String() != want
}

func blobBytes(repo *git.Repository, hash string) ([]byte, error) {
	blob, err := repo.BlobObject(plumbing.NewHash(hash))
	if err != nil {
		return nil, fmt.Errorf("failed to read blob %s: %w", hash, err)
	}
	r, err := blob.Reader()
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}

// unreadablePages lists incoming .md files Schist can't show as pages.
func unreadablePages(repo *git.Repository, apply []syncplan.Change) []string {
	var out []string
	for _, c := range apply {
		if c.Delete || !isPagePath(c.Path) {
			continue
		}
		logical := "/" + strings.TrimSuffix(c.Path, ".md")
		data, err := blobBytes(repo, c.Blob)
		if err != nil || utils.ValidatePath(logical) != nil {
			out = append(out, c.Path)
			continue
		}
		if _, err := serializer.DeserializeDocument(data); err != nil {
			out = append(out, c.Path)
		}
	}
	sort.Strings(out)
	return out
}

// unreadableAt lists the pages in commit h that Schist can't show, sorted.
func unreadableAt(repo *git.Repository, h plumbing.Hash) ([]string, error) {
	tree, err := commitTree(repo, h)
	if err != nil {
		return nil, err
	}
	all := make([]syncplan.Change, 0, len(tree))
	for p, blob := range tree {
		all = append(all, syncplan.Change{Path: p, Blob: blob})
	}
	return unreadablePages(repo, all), nil
}

// notifyPulled tells the link index which pages a pull changed: those still
// on disk that Schist can read (deleted and unreadable files have no page).
func (gs *GitHubService) notifyPulled(paths, unreadable []string) {
	if gs.onPulled == nil {
		return
	}
	var pages []string
	for _, p := range paths {
		logical := "/" + strings.TrimSuffix(p, ".md")
		if !isPagePath(p) || utils.ValidatePath(logical) != nil || slices.Contains(unreadable, p) {
			continue
		}
		if _, err := os.Stat(filepath.Join(gs.gitService.dataDir, filepath.FromSlash(p))); err != nil {
			continue
		}
		pages = append(pages, logical)
	}
	gs.onPulled(pages)
}

// SyncPreview is what a two-way sync would do now.
type SyncPreview struct {
	Incoming   []string `json:"incoming"`   // pages/files that change in the wiki
	Outgoing   []string `json:"outgoing"`   // local changes that go to GitHub
	Conflicts  []string `json:"conflicts"`
	Unreadable []string `json:"unreadable"`
	RemoteHead string   `json:"remote_head"`
}

// ConflictVersions are the wiki's and GitHub's versions of a page a paused
// sync is waiting on.
type ConflictVersions struct {
	Path   string      `json:"path"`
	Local  string      `json:"local"`
	Remote string      `json:"remote"`
	Diff   *DiffResult `json:"diff"`
}

// PreviewSync reports what a two-way sync would do now, without doing it.
func (gs *GitHubService) PreviewSync() (*SyncPreview, error) {
	if !gs.IsEnabled() {
		return nil, errGitHubNotEnabled()
	}
	gs.syncMu.Lock()
	defer gs.syncMu.Unlock()
	if _, err := gs.ensureClient(); err != nil {
		return nil, err
	}
	if err := gs.setupGitRemote(); err != nil {
		return nil, apierrors.NewInternalError("Couldn't configure the git remote. See the server log.").WithCause(err)
	}
	if err := gs.commitUncommittedChanges(); err != nil {
		return nil, apierrors.NewInternalError("Couldn't commit local changes before the preview. See the server log.").
			WithCause(err)
	}
	out, plan, err := gs.pullOnce(nil, true)
	if err != nil {
		return nil, err
	}
	p := &SyncPreview{Incoming: []string{}, Outgoing: []string{}, Conflicts: out.Conflicts,
		Unreadable: out.Unreadable, RemoteHead: out.RemoteHead.String()}
	if p.Conflicts == nil {
		p.Conflicts = []string{}
	}
	if p.Unreadable == nil {
		p.Unreadable = []string{}
	}
	for _, c := range plan.Apply {
		p.Incoming = append(p.Incoming, c.Path)
	}
	outgoing, err := gs.outgoingPaths(out.RemoteHead, plan.Conflicts)
	if err != nil {
		return nil, err
	}
	p.Outgoing = outgoing
	return p, nil
}

// outgoingPaths lists files the wiki changed since the last commit it shares
// with GitHub (all of them when it shares none), minus the conflicts.
func (gs *GitHubService) outgoingPaths(remoteHead plumbing.Hash, conflicts []string) ([]string, error) {
	repo, err := gs.localRepository()
	if err != nil {
		return nil, err
	}
	head, err := repo.Head()
	if err != nil {
		return nil, err
	}
	base := plumbing.ZeroHash
	if !remoteHead.IsZero() {
		if base, err = mergeBase(repo, head.Hash(), remoteHead); err != nil {
			return nil, err
		}
	}
	baseTree, err := commitTree(repo, base)
	if err != nil {
		return nil, err
	}
	localTree, err := commitTree(repo, head.Hash())
	if err != nil {
		return nil, err
	}
	skip := map[string]bool{}
	for _, c := range conflicts {
		skip[c] = true
	}
	out := []string{}
	seen := map[string]bool{}
	for _, t := range []syncplan.Tree{baseTree, localTree} {
		for p := range t {
			if seen[p] || skip[p] {
				continue
			}
			seen[p] = true
			if baseTree[p] != localTree[p] {
				out = append(out, p)
			}
		}
	}
	sort.Strings(out)
	return out, nil
}

// ConflictVersions returns the wiki's and GitHub's version of a page a paused
// sync is waiting on, with a diff between them.
func (gs *GitHubService) ConflictVersions(path string) (*ConflictVersions, error) {
	s := gs.settings.GetGitHubSettings()
	if !slices.Contains(s.SyncConflicts, path) {
		return nil, apierrors.NewNotFoundError("sync conflict", path)
	}
	repo, err := gs.localRepository()
	if err != nil {
		return nil, err
	}
	remoteTree, err := commitTree(repo, plumbing.NewHash(s.PausedRemoteHead))
	if err != nil {
		return nil, err
	}
	head, err := repo.Head()
	if err != nil {
		return nil, err
	}
	localTree, err := commitTree(repo, head.Hash())
	if err != nil {
		return nil, err
	}
	read := func(blob string) string {
		if blob == "" {
			return ""
		}
		b, _ := blobBytes(repo, blob)
		return string(b)
	}
	v := &ConflictVersions{Path: path, Local: read(localTree[path]), Remote: read(remoteTree[path])}
	v.Diff = gs.gitService.computeDiff("/"+strings.TrimSuffix(path, ".md"), "schist", "github", v.Local, v.Remote)
	return v, nil
}

package services

import (
	"context"
	stderrors "errors"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/transport"
	githttp "github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/google/go-github/v57/github"
	"golang.org/x/oauth2"

	appconfig "github.com/MorrisMorrison/schist/internal/config"
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/syncplan"
)

const (
	DefaultGitHubBranch = "main"

	// githubRequestTimeout bounds each individual GitHub API / network call so a
	// hung endpoint cannot block a request (or a status poll) indefinitely.
	githubRequestTimeout = 30 * time.Second

	// githubPushTimeout bounds one push. The first push of a big wiki uploads
	// its whole history, so it gets much longer than an API call.
	githubPushTimeout = 10 * time.Minute
)

type GitHubService struct {
	config        *appconfig.Config
	settings      *appconfig.Settings
	gitService    *GitService
	secretManager *SecretManager
	ctx           context.Context
	dataDir       string

	// clientMu guards client: requests (status, sync, setup, disconnect) read
	// and replace it concurrently. Use currentClient/setClient/ensureClient.
	clientMu sync.Mutex
	client   *github.Client

	// syncMu runs one sync at a time: manual, on-save and automatic syncs
	// share the local repository and the remote branch.
	syncMu    sync.Mutex
	scheduler *syncScheduler

	// onPulled, if set, gets the page paths a pull changed (wired to the link
	// index). beforeApply is a test hook that runs just before applying;
	// beforePush is one that runs at the start of each push.
	onPulled    func(pages []string)
	beforeApply func()
	beforePush  func()
}

// SetPullHook registers fn to run with the pages a pull changed.
func (gs *GitHubService) SetPullHook(fn func(pages []string)) { gs.onPulled = fn }

type GitHubSettings struct {
	Enabled    bool      `json:"enabled"`
	Owner      string    `json:"owner"`
	Repository string    `json:"repository"`
	Branch     string    `json:"branch"`
	AutoSync   bool      `json:"auto_sync"`
	SyncOnSave bool      `json:"sync_on_save"`
	LastSync   time.Time `json:"last_sync,omitempty"`
	// LastSyncAttempt, LastSyncError and LastSyncErrorCode describe the most
	// recent sync, background ones included; the error fields are empty after
	// a success.
	LastSyncAttempt   time.Time `json:"last_sync_attempt,omitempty"`
	LastSyncError     string    `json:"last_sync_error,omitempty"`
	LastSyncErrorCode string    `json:"last_sync_error_code,omitempty"`
	// Mode is "backup" or "two-way"; empty is reported as is (the UI treats
	// it as backup). SyncConflicts, PausedRemoteHead and Unreadable describe
	// a paused or partly unreadable two-way sync.
	Mode             string   `json:"mode,omitempty"`
	SyncConflicts    []string `json:"sync_conflicts,omitempty"`
	PausedRemoteHead string   `json:"paused_remote_head,omitempty"`
	Unreadable       []string `json:"unreadable,omitempty"`
	// AutoSyncIntervalMinutes is the server's automatic backup interval
	// (SCHIST_GITHUB_AUTO_SYNC_MINUTES).
	AutoSyncIntervalMinutes int `json:"auto_sync_interval_minutes"`
	// SyncDelayMinutes is how long backup after edits waits after the last
	// edit (the setting, or the default).
	SyncDelayMinutes int `json:"sync_delay_minutes"`
}

type GitHubConnectionStatus struct {
	Connected      bool `json:"connected"`
	TokenExists    bool `json:"token_exists"`
	PendingChanges int  `json:"pending_changes"`
}

type GitHubSetupRequest struct {
	Token      string `json:"token" binding:"required"`
	Owner      string `json:"owner" binding:"required"`
	Repo       string `json:"repo" binding:"required"`
	Branch     string `json:"branch,omitempty"`
	AutoSync   bool   `json:"auto_sync,omitempty"`
	SyncOnSave bool   `json:"sync_on_save,omitempty"`
	// SyncDelayMinutes is how long backup after edits waits (1 to 60).
	SyncDelayMinutes *int `json:"sync_delay_minutes,omitempty"`
}

type GitHubConfigRequest struct {
	AutoSync   *bool   `json:"auto_sync,omitempty"`
	SyncOnSave *bool   `json:"sync_on_save,omitempty"`
	Branch     *string `json:"branch,omitempty"`
	// SyncDelayMinutes sets how long backup after edits waits (1 to 60).
	SyncDelayMinutes *int `json:"sync_delay_minutes,omitempty"`
}

// GitHubSyncOptions changes how one sync pushes.
type GitHubSyncOptions struct {
	// ReplaceRemote replaces the GitHub branch with the wiki's history when
	// the two have diverged (a force push). The user confirms it for one sync;
	// it is never stored.
	ReplaceRemote bool `json:"replace_remote,omitempty"`

	// Resolutions picks a side ("local" or "remote") for pages a paused
	// two-way sync found changed on both sides; RemoteHead is the GitHub
	// commit they were decided against.
	Resolutions map[string]string `json:"resolutions,omitempty"`
	RemoteHead  string            `json:"remote_head,omitempty"`
}

// GitHubConnectionTestResult describes a successful connection test.
type GitHubConnectionTestResult struct {
	Message      string `json:"message"`
	Branch       string `json:"branch"`
	BranchExists bool   `json:"branch_exists"`
}

type GitHubSyncResult struct {
	Success     bool     `json:"success"`
	Message     string   `json:"message"`
	SyncedFiles int      `json:"syncedFiles,omitempty"`
	Errors      []string `json:"errors,omitempty"`
	Timestamp   string   `json:"timestamp"`
}

type GitHubRepoInfo struct {
	Owner       string `json:"owner"`
	Name        string `json:"name"`
	FullName    string `json:"full_name"`
	Description string `json:"description,omitempty"`
	Private     bool   `json:"private"`
	HTMLURL     string `json:"html_url"`
	CloneURL    string `json:"clone_url"`
	// Branch is the branch backups go to. BranchExists is false for an empty
	// repository or a new branch, which the first sync creates.
	Branch       string `json:"branch"`
	BranchExists bool   `json:"branch_exists"`
}

func NewGitHubService(
	config *appconfig.Config,
	gitService *GitService,
	settings *appconfig.Settings,
	secretManager *SecretManager) *GitHubService {
	service := &GitHubService{
		config:        config,
		settings:      settings,
		gitService:    gitService,
		secretManager: secretManager,
		ctx:           context.Background(),
		dataDir:       config.DataDir,
	}
	service.scheduler = newSyncScheduler(syncSchedulerConfig{
		sync: func() error {
			_, err := service.Sync(GitHubSyncOptions{})
			return err
		},
		syncOnSave: service.ShouldSyncOnSave,
		autoSync:   service.ShouldAutoSync,
		debounce:   service.backupDelay,
		maxWait:    syncAfterEditMaxWait,
		interval:   service.autoSyncInterval(),
	})

	githubSettings := settings.GetGitHubSettings()
	if githubSettings.Enabled && service.hasToken() {
		if _, err := service.ensureClient(); err != nil {
			fmt.Printf("Warning: failed to initialize GitHub client: %v\n", err)
		}
	}

	return service
}

// NotifyCommitted tells the background sync that a change was committed. It
// is GitService's commit hook: it returns at once and never fails the write.
func (gs *GitHubService) NotifyCommitted() {
	gs.scheduler.Notify()
}

// StartBackgroundSync starts the automatic sync loop until ctx is done.
func (gs *GitHubService) StartBackgroundSync(ctx context.Context) {
	gs.scheduler.Start(ctx)
}

// StopBackgroundSync cancels pending syncs and waits (up to ctx) for a
// running one to finish.
func (gs *GitHubService) StopBackgroundSync(ctx context.Context) {
	gs.scheduler.Stop(ctx)
}

func (gs *GitHubService) hasToken() bool {
	return gs.secretManager.CanUseGitHubToken()
}

// getToken returns the saved token. Under the server key it needs no unlock;
// an older passkey-protected token returns SECRETS_LOCKED until unlocked.
func (gs *GitHubService) getToken() (string, error) {
	if gs.settings.GetGitHubSettings().Token == nil {
		return "", apierrors.NewInvalidStateError("GitHub token not configured. Set up GitHub backup again.")
	}
	return gs.secretManager.GetGitHubToken()
}

// newGitHubClient builds a GitHub API client authenticated with the given token.
func newGitHubClient(ctx context.Context, token string) *github.Client {
	ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token})
	return github.NewClient(oauth2.NewClient(ctx, ts))
}

// currentClient returns the shared client, or nil if it hasn't been built.
func (gs *GitHubService) currentClient() *github.Client {
	gs.clientMu.Lock()
	defer gs.clientMu.Unlock()
	return gs.client
}

// setClient replaces the shared client (nil drops it).
func (gs *GitHubService) setClient(client *github.Client) {
	gs.clientMu.Lock()
	defer gs.clientMu.Unlock()
	gs.client = client
}

// ensureClient returns the shared client, building it from the stored token
// the first time. The lock is held while building, so concurrent callers get
// one client. Callers keep the returned client rather than re-reading the field.
func (gs *GitHubService) ensureClient() (*github.Client, error) {
	gs.clientMu.Lock()
	defer gs.clientMu.Unlock()
	if gs.client != nil {
		return gs.client, nil
	}
	token, err := gs.getToken()
	if err != nil {
		return nil, err
	}
	gs.client = newGitHubClient(gs.ctx, token)
	return gs.client, nil
}

// requestContext returns a per-call context with a bounded timeout plus its
// cancel func, so every network call is protected even though gs.ctx itself has
// no deadline. Callers must defer cancel().
func (gs *GitHubService) requestContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(gs.ctx, githubRequestTimeout)
}

// validateRepoFields checks the fields every repository lookup needs.
func validateRepoFields(token, owner, repo string) error {
	if token == "" {
		return apierrors.NewValidationError("GitHub token is required")
	}
	if owner == "" {
		return apierrors.NewValidationError("Repository owner is required")
	}
	if repo == "" {
		return apierrors.NewValidationError("Repository name is required")
	}
	return nil
}

// githubAPIError turns a failed GitHub API call into a typed error the UI can
// explain. GitHub answers 404 both for a missing repository and for one the
// token can't see.
func githubAPIError(err error, owner, repo string) error {
	full := owner + "/" + repo
	var ghErr *github.ErrorResponse
	if stderrors.As(err, &ghErr) && ghErr.Response != nil {
		switch ghErr.Response.StatusCode {
		case http.StatusUnauthorized:
			return apierrors.NewValidationError(
				"GitHub rejected the token. Check that it is valid and hasn't expired.").WithCause(err)
		case http.StatusForbidden:
			return apierrors.NewForbiddenError(fmt.Sprintf(
				"The token isn't allowed to access %s. It needs read and write access to the repository contents.",
				full)).WithCause(err)
		case http.StatusNotFound:
			return repositoryNotFoundError(full).WithCause(err)
		}
	}
	if stderrors.Is(err, context.DeadlineExceeded) {
		return apierrors.NewTimeoutError("GitHub request").WithCause(err)
	}
	return apierrors.NewUnavailableError("GitHub").WithCause(err)
}

func repositoryNotFoundError(fullName string) *apierrors.APIError {
	return apierrors.NewAPIError(apierrors.ErrCodeNotFound,
		fmt.Sprintf("Repository %s not found, or the token can't access it.", fullName), http.StatusNotFound).
		WithDetails("resource", "repository").
		WithDetails("identifier", fullName)
}

// isGitHubNotFound reports a 404 from the GitHub API.
func isGitHubNotFound(err error) bool {
	var ghErr *github.ErrorResponse
	return stderrors.As(err, &ghErr) && ghErr.Response != nil && ghErr.Response.StatusCode == http.StatusNotFound
}

// lookupRepository fetches owner/repo, with a typed error when it can't.
func (gs *GitHubService) lookupRepository(client *github.Client, owner, repo string) (*github.Repository, error) {
	ctx, cancel := gs.requestContext()
	defer cancel()
	repository, _, err := client.Repositories.Get(ctx, owner, repo)
	if err != nil {
		return nil, githubAPIError(err, owner, repo)
	}
	return repository, nil
}

// branchExists reports whether the branch exists on GitHub. A missing branch
// (including every branch of an empty repository) is not an error: the first
// sync creates it.
func (gs *GitHubService) branchExists(client *github.Client, owner, repo, branch string) (bool, error) {
	ctx, cancel := gs.requestContext()
	defer cancel()
	_, resp, err := client.Repositories.GetBranch(ctx, owner, repo, branch, 1)
	if err == nil {
		return true, nil
	}
	// With redirects followed, GetBranch reports a non-200 as a plain error
	// next to the response, not as a github.ErrorResponse.
	if isGitHubNotFound(err) || (resp != nil && resp.StatusCode == http.StatusNotFound) {
		return false, nil
	}
	if resp != nil && resp.Response != nil {
		return false, githubAPIError(&github.ErrorResponse{Response: resp.Response}, owner, repo)
	}
	return false, githubAPIError(err, owner, repo)
}

// backupBranch is the requested branch, else the repository's default branch.
func backupBranch(requested string, repo *github.Repository) string {
	if requested != "" {
		return requested
	}
	if repo.GetDefaultBranch() != "" {
		return repo.GetDefaultBranch()
	}
	return DefaultGitHubBranch
}

func (gs *GitHubService) SetupRepository(req *GitHubSetupRequest) (*GitHubRepoInfo, error) {
	if err := validateRepoFields(req.Token, req.Owner, req.Repo); err != nil {
		return nil, err
	}
	if err := validateBackupDelay(req.SyncDelayMinutes); err != nil {
		return nil, err
	}

	// The token is stored encrypted: with the server key there's nothing to
	// unlock; without one, setup needs the unlocked store. Check first: the
	// UI may still show an unlock from before a server restart.
	if !gs.secretManager.CanStoreGitHubToken() {
		return nil, apierrors.NewSecretsLockedError()
	}

	tempClient := newGitHubClient(gs.ctx, req.Token)

	repo, err := gs.lookupRepository(tempClient, req.Owner, req.Repo)
	if err != nil {
		return nil, err
	}

	branch := backupBranch(req.Branch, repo)
	exists, err := gs.branchExists(tempClient, req.Owner, req.Repo, branch)
	if err != nil {
		return nil, err
	}

	githubSettings := &appconfig.GitHubSettings{
		Enabled:    true,
		Owner:      req.Owner,
		Repository: req.Repo,
		Branch:     branch,
		AutoSync:   req.AutoSync,
		SyncOnSave: req.SyncOnSave,
	}
	if req.SyncDelayMinutes != nil {
		githubSettings.SyncDelayMinutes = *req.SyncDelayMinutes
	}

	if err := gs.secretManager.SetGitHubToken(req.Token); err != nil {
		return nil, fmt.Errorf("failed to store GitHub token: %w", err)
	}

	// Keep the token SetGitHubToken just stored; read it under the same lock
	// as the write so a concurrent change can't be lost in between.
	if err := gs.settings.Update(gs.dataDir, func(st *appconfig.Settings) error {
		githubSettings.Token = st.GitHub.Token
		st.GitHub = *githubSettings
		return nil
	}); err != nil {
		return nil, fmt.Errorf("failed to save GitHub config: %w", err)
	}

	gs.setClient(tempClient)

	if err := gs.setupGitRemote(); err != nil {
		return nil, fmt.Errorf("failed to setup git remote: %w", err)
	}

	repoInfo := &GitHubRepoInfo{
		Owner:    req.Owner,
		Name:     req.Repo,
		FullName: repo.GetFullName(),
		Private:  repo.GetPrivate(),
		HTMLURL:  repo.GetHTMLURL(),
		CloneURL: repo.GetCloneURL(),

		Branch:       branch,
		BranchExists: exists,
	}

	if repo.Description != nil {
		repoInfo.Description = *repo.Description
	}

	return repoInfo, nil
}

// GetGitHubSettings returns non-sensitive configuration without requiring secret unlock
func (gs *GitHubService) GetGitHubSettings() *GitHubSettings {
	githubSettings := gs.settings.GetGitHubSettings()

	return &GitHubSettings{
		Enabled:                 githubSettings.Enabled,
		Owner:                   githubSettings.Owner,
		Repository:              githubSettings.Repository,
		Branch:                  githubSettings.Branch,
		AutoSync:                githubSettings.AutoSync,
		SyncOnSave:              githubSettings.SyncOnSave,
		LastSync:                githubSettings.LastSync,
		LastSyncAttempt:         githubSettings.LastSyncAttempt,
		LastSyncError:           githubSettings.LastSyncError,
		LastSyncErrorCode:       githubSettings.LastSyncErrorCode,
		Mode:                    githubSettings.Mode,
		SyncConflicts:           githubSettings.SyncConflicts,
		PausedRemoteHead:        githubSettings.PausedRemoteHead,
		Unreadable:              githubSettings.Unreadable,
		AutoSyncIntervalMinutes: int(gs.autoSyncInterval() / time.Minute),
		SyncDelayMinutes:        int(gs.backupDelay() / time.Minute),
	}
}

// validateBackupDelay accepts no value (keep the current one) or 1 to 60.
func validateBackupDelay(minutes *int) error {
	if minutes != nil && (*minutes < minBackupDelayMinutes || *minutes > maxBackupDelayMinutes) {
		return apierrors.NewValidationError(fmt.Sprintf(
			"The backup delay must be %d to %d minutes.", minBackupDelayMinutes, maxBackupDelayMinutes))
	}
	return nil
}

// backupDelay is how long backup after edits waits after the last edit: the
// saved setting within its bounds, or the default.
func (gs *GitHubService) backupDelay() time.Duration {
	minutes := gs.settings.GetGitHubSettings().SyncDelayMinutes
	if minutes < minBackupDelayMinutes || minutes > maxBackupDelayMinutes {
		return defaultBackupDelay
	}
	return time.Duration(minutes) * time.Minute
}

// autoSyncInterval is the configured automatic backup interval.
func (gs *GitHubService) autoSyncInterval() time.Duration {
	if gs.config == nil || gs.config.GitHubAutoSyncInterval <= 0 {
		return appconfig.DefaultGitHubAutoSyncMinutes * time.Minute
	}
	return gs.config.GitHubAutoSyncInterval
}

// GetGitHubConnectionStatus returns connection status requiring secret unlock
func (gs *GitHubService) GetGitHubConnectionStatus() (*GitHubConnectionStatus, error) {
	status := &GitHubConnectionStatus{
		TokenExists:    gs.hasTokenNoDecrypt(),
		Connected:      false,
		PendingChanges: 0,
	}

	// If no token exists, we can't be connected
	if !status.TokenExists {
		return status, nil
	}

	// Try to initialize client (requires secret unlock)
	client := gs.currentClient()
	if client == nil && gs.hasToken() {
		var err error
		if client, err = gs.ensureClient(); err != nil {
			return status, err
		}
	}

	if client == nil {
		return status, nil
	}

	// Test connection to repository
	githubSettings := gs.settings.GetGitHubSettings()
	if githubSettings.Owner != "" && githubSettings.Repository != "" {
		_, err := gs.lookupRepository(client, githubSettings.Owner, githubSettings.Repository)
		status.Connected = err == nil
		if err != nil {
			return status, err
		}
	}

	return status, nil
}

// hasTokenNoDecrypt checks if a token exists without decrypting it
func (gs *GitHubService) hasTokenNoDecrypt() bool {
	githubSettings := gs.settings.GetGitHubSettings()
	return githubSettings.Token != nil
}

func (gs *GitHubService) UpdateConfiguration(req *GitHubConfigRequest) error {
	githubSettings := gs.settings.GetGitHubSettings()

	if !githubSettings.Enabled {
		return errGitHubNotEnabled()
	}
	if err := validateBackupDelay(req.SyncDelayMinutes); err != nil {
		return err
	}

	// A branch that doesn't exist yet is fine (the next sync creates it);
	// only a failed lookup stops the change.
	if req.Branch != nil && *req.Branch != "" {
		if client := gs.currentClient(); client != nil {
			// GitHub answers 404 for the branch of a missing repository too.
			if _, err := gs.lookupRepository(client, githubSettings.Owner, githubSettings.Repository); err != nil {
				return err
			}
			if _, err := gs.branchExists(client, githubSettings.Owner, githubSettings.Repository, *req.Branch); err != nil {
				return err
			}
		}
	}

	// Apply only the requested fields, under the lock, after the (network)
	// branch check.
	return gs.settings.Update(gs.dataDir, func(st *appconfig.Settings) error {
		if req.AutoSync != nil {
			st.GitHub.AutoSync = *req.AutoSync
		}
		if req.SyncOnSave != nil {
			st.GitHub.SyncOnSave = *req.SyncOnSave
		}
		if req.SyncDelayMinutes != nil {
			st.GitHub.SyncDelayMinutes = *req.SyncDelayMinutes
		}
		if req.Branch != nil && *req.Branch != "" {
			st.GitHub.Branch = *req.Branch
		}
		return nil
	})
}

// errGitHubNotEnabled is returned when GitHub backup isn't set up.
func errGitHubNotEnabled() error {
	return apierrors.NewInvalidStateError("GitHub backup is not set up")
}

// SyncToGitHub runs a normal sync, which never replaces remote history.
func (gs *GitHubService) SyncToGitHub() (*GitHubSyncResult, error) {
	return gs.Sync(GitHubSyncOptions{})
}

// Sync commits pending changes and pushes the wiki to the configured branch.
// Failures are typed errors. The outcome is recorded in the settings, so the
// UI also shows the status of background syncs.
func (gs *GitHubService) Sync(opts GitHubSyncOptions) (*GitHubSyncResult, error) {
	if !gs.IsEnabled() {
		return nil, errGitHubNotEnabled()
	}

	gs.syncMu.Lock()
	defer gs.syncMu.Unlock()

	result, err := gs.sync(opts)
	gs.recordSyncOutcome(err)
	if err != nil {
		log.Printf("[GitHubService] Sync failed: %v", err)
	}
	return result, err
}

func (gs *GitHubService) sync(opts GitHubSyncOptions) (*GitHubSyncResult, error) {
	client, err := gs.ensureClient()
	if err != nil {
		return nil, err
	}

	if gs.gitService == nil {
		return nil, apierrors.NewInternalError("Git service is not available").
			WithCause(fmt.Errorf("git service not available"))
	}

	if err := gs.gitService.HealthCheckWithRepair(false); err != nil {
		log.Printf("[GitHubService] Health check failed, attempting auto-repair: %v", err)
		if repairErr := gs.gitService.HealthCheckWithRepair(true); repairErr != nil {
			return nil, apierrors.NewInternalError(
				"The wiki's git repository couldn't be opened or repaired. See the server log.").WithCause(repairErr)
		}
	}

	githubSettings := gs.settings.GetGitHubSettings()
	if _, err := gs.lookupRepository(client, githubSettings.Owner, githubSettings.Repository); err != nil {
		return nil, err
	}

	if err := gs.setupGitRemote(); err != nil {
		return nil, apierrors.NewInternalError("Couldn't configure the git remote. See the server log.").WithCause(err)
	}

	if err := gs.commitUncommittedChanges(); err != nil {
		return nil, apierrors.NewInternalError("Couldn't commit local changes before the sync. See the server log.").
			WithCause(err)
	}

	if githubSettings.TwoWay() && !opts.ReplaceRemote {
		return gs.syncTwoWay(opts)
	}

	// The stored ForcePush (not settable through the API) still applies, for
	// anyone who set it by hand in config.json.
	if err := gs.pushToGitHub(opts.ReplaceRemote || githubSettings.ForcePush); err != nil {
		return nil, err
	}
	if githubSettings.TwoWay() {
		// Replacing GitHub's history settles any paused conflicts.
		gs.recordPause(nil, "", nil)
	}

	return &GitHubSyncResult{
		Success:   true,
		Message:   "GitHub sync completed successfully",
		Timestamp: time.Now().Format(time.RFC3339),
	}, nil
}

// maxTwoWayAttempts bounds how often a sync re-pulls when GitHub moves
// while it pushes (Obsidian pushing at the same moment).
const maxTwoWayAttempts = 3

// syncTwoWay pulls, then pushes. It pauses on pages changed on both sides
// unless opts resolves them, and starts over when the wiki or GitHub moved.
func (gs *GitHubService) syncTwoWay(opts GitHubSyncOptions) (*GitHubSyncResult, error) {
	resolutions, err := gs.resolutionsFor(opts)
	if err != nil {
		return nil, err
	}
	for attempt := 0; attempt < maxTwoWayAttempts; attempt++ {
		out, _, err := gs.pullOnce(resolutions, false)
		if stderrors.Is(err, errHeadMoved) {
			continue
		}
		if stderrors.Is(err, errIgnoredFileInTheWay) {
			// The user has to move the file; keep the message naming it.
			return nil, apierrors.NewInvalidStateError(err.Error()).WithCause(err)
		}
		if err != nil {
			return nil, err
		}
		if len(out.Conflicts) > 0 {
			gs.recordPause(out.Conflicts, out.RemoteHead.String(), out.Unreadable)
			return nil, apierrors.NewSyncConflictError(out.Conflicts, out.RemoteHead.String())
		}
		err = gs.pushToGitHub(false)
		if errorCodeOf(err) == apierrors.ErrCodeSyncRemoteDiverged {
			continue // GitHub moved since the fetch: pull again
		}
		if err != nil {
			return nil, err
		}
		gs.recordPause(nil, "", out.Unreadable)
		return &GitHubSyncResult{Success: true, Message: "GitHub sync completed successfully",
			Timestamp: time.Now().Format(time.RFC3339)}, nil
	}
	return nil, apierrors.NewUnavailableError("GitHub (the branch kept changing during the sync; it retries on the next sync)")
}

// resolutionsFor turns the request's choices into planner resolutions, each
// tied to the page's blob at the GitHub commit the user decided against.
func (gs *GitHubService) resolutionsFor(opts GitHubSyncOptions) (map[string]syncplan.Resolution, error) {
	if len(opts.Resolutions) == 0 {
		return nil, nil
	}
	repo, err := gs.localRepository()
	if err != nil {
		return nil, err
	}
	decidedTree, err := commitTree(repo, plumbing.NewHash(opts.RemoteHead))
	if err != nil {
		return nil, apierrors.NewValidationError("remote_head is not a commit this wiki has fetched").WithCause(err)
	}
	out := map[string]syncplan.Resolution{}
	for path, side := range opts.Resolutions {
		if side != string(syncplan.SideLocal) && side != string(syncplan.SideRemote) {
			return nil, apierrors.NewValidationError(fmt.Sprintf("resolution for %s must be local or remote", path))
		}
		out[path] = syncplan.Resolution{Side: syncplan.Side(side), RemoteBlob: decidedTree[path]}
	}
	return out, nil
}

// recordPause stores (or, with no conflicts, clears) the paused state.
func (gs *GitHubService) recordPause(conflicts []string, remoteHead string, unreadable []string) {
	if err := gs.settings.Update(gs.dataDir, func(st *appconfig.Settings) error {
		st.GitHub.SyncConflicts = conflicts
		st.GitHub.PausedRemoteHead = remoteHead
		st.GitHub.Unreadable = unreadable
		return nil
	}); err != nil {
		log.Printf("[GitHubService] Warning: failed to record the sync pause: %v", err)
	}
}

// errorCodeOf is the API error code of err, or "" for other errors.
func errorCodeOf(err error) apierrors.ErrorCode {
	var apiErr *apierrors.APIError
	if stderrors.As(err, &apiErr) {
		return apiErr.Code
	}
	return ""
}

// recordSyncOutcome stores when the sync ran and how it ended. Only the sync
// fields are written: other settings may have changed during the sync.
func (gs *GitHubService) recordSyncOutcome(syncErr error) {
	now := time.Now()
	message, code := "", ""
	if syncErr != nil {
		apiErr := apierrors.WrapError(syncErr)
		message, code = apiErr.Message, string(apiErr.Code)
	}
	if err := gs.settings.Update(gs.dataDir, func(st *appconfig.Settings) error {
		st.GitHub.LastSyncAttempt = now
		st.GitHub.LastSyncError = message
		st.GitHub.LastSyncErrorCode = code
		if syncErr == nil {
			st.GitHub.LastSync = now
		}
		return nil
	}); err != nil {
		log.Printf("[GitHubService] Warning: failed to record the sync status: %v", err)
	}
}

// TestConnection checks that the token can reach the repository, and whether
// the branch (the repository's default branch when empty) exists yet.
func (gs *GitHubService) TestConnection(token, owner, repo, branch string) (*GitHubConnectionTestResult, error) {
	if err := validateRepoFields(token, owner, repo); err != nil {
		return nil, err
	}

	tempClient := newGitHubClient(gs.ctx, token)
	repository, err := gs.lookupRepository(tempClient, owner, repo)
	if err != nil {
		return nil, err
	}

	branch = backupBranch(branch, repository)
	exists, err := gs.branchExists(tempClient, owner, repo, branch)
	if err != nil {
		return nil, err
	}

	result := &GitHubConnectionTestResult{Branch: branch, BranchExists: exists}
	if exists {
		result.Message = fmt.Sprintf("Connected to %s/%s. Backups go to the branch %q.", owner, repo, branch)
	} else {
		result.Message = fmt.Sprintf(
			"Connected to %s/%s. The branch %q doesn't exist yet; the first sync creates it.", owner, repo, branch)
	}
	return result, nil
}

func (gs *GitHubService) IsEnabled() bool {
	githubSettings := gs.settings.GetGitHubSettings()
	return githubSettings.Enabled
}

func (gs *GitHubService) ShouldSyncOnSave() bool {
	githubSettings := gs.settings.GetGitHubSettings()
	return githubSettings.Enabled && githubSettings.SyncOnSave
}

func (gs *GitHubService) ShouldAutoSync() bool {
	githubSettings := gs.settings.GetGitHubSettings()
	return githubSettings.Enabled && githubSettings.AutoSync
}

// localRepository returns the local git repository that is synced.
func (gs *GitHubService) localRepository() (*git.Repository, error) {
	if gs.gitService == nil || gs.gitService.repository == nil {
		return nil, fmt.Errorf("git service or repository not available")
	}
	return gs.gitService.repository, nil
}

// remoteURL is the HTTPS clone URL of the configured repository.
func remoteURL(settings *appconfig.GitHubSettings) string {
	return fmt.Sprintf("https://github.com/%s/%s.git", settings.Owner, settings.Repository)
}

func (gs *GitHubService) setupGitRemote() error {
	repo, err := gs.localRepository()
	if err != nil {
		return err
	}

	originURL := remoteURL(gs.settings.GetGitHubSettings())

	cfg, err := repo.Config()
	if err != nil {
		return fmt.Errorf("failed to get repository config: %w", err)
	}

	cfg.Remotes["origin"] = &config.RemoteConfig{
		Name: "origin",
		URLs: []string{originURL},
	}

	err = repo.Storer.SetConfig(cfg)
	if err != nil {
		return fmt.Errorf("failed to persist git config: %w", err)
	}

	verifyConfig, err := repo.Config()
	if err != nil {
		return fmt.Errorf("failed to verify git config: %w", err)
	}

	if remote, exists := verifyConfig.Remotes["origin"]; !exists || len(remote.URLs) == 0 || remote.URLs[0] != originURL {
		return fmt.Errorf("failed to set git remote - verification failed")
	}

	return nil
}

func (gs *GitHubService) commitUncommittedChanges() error {
	if _, err := gs.localRepository(); err != nil {
		return err
	}

	// CommitPendingChanges never stages the .schist/ app state, which holds
	// users, passkey key seeds, share tokens and the GitHub token itself.
	_, err := gs.gitService.CommitPendingChanges("Sync: commit changes before GitHub sync")
	return err
}

func (gs *GitHubService) countLocalCommits() (int, error) {
	repo, err := gs.localRepository()
	if err != nil {
		return 0, err
	}

	commitIter, err := repo.Log(&git.LogOptions{})
	if err != nil {
		return 0, fmt.Errorf("failed to get commit log: %w", err)
	}
	defer commitIter.Close()

	count := 0
	err = commitIter.ForEach(func(commit *object.Commit) error {
		count++
		return nil
	})
	if err != nil {
		return 0, fmt.Errorf("failed to count commits: %w", err)
	}

	return count, nil
}

// pushAction is what a sync does with the remote branch.
type pushAction int

const (
	pushNone        pushAction = iota // the remote branch already has the local HEAD
	pushCreate                        // the branch doesn't exist yet (e.g. an empty repository)
	pushFastForward                   // the remote is behind: a normal push
	pushDiverged                      // the remote has commits the wiki doesn't: needs a force push
)

// decidePush compares the remote branch head (zero when the branch doesn't
// exist) with the local HEAD. isAncestor reports whether the remote head is
// part of the local history; it's only called when the two differ.
func decidePush(remote, local plumbing.Hash, isAncestor func() (bool, error)) (pushAction, error) {
	switch {
	case remote.IsZero():
		return pushCreate, nil
	case remote == local:
		return pushNone, nil
	}
	ancestor, err := isAncestor()
	if err != nil {
		return pushNone, err
	}
	if ancestor {
		return pushFastForward, nil
	}
	return pushDiverged, nil
}

// isAncestorCommit reports whether ancestor is in descendant's history. A
// commit the local repository doesn't have (another history, such as a README
// made on GitHub) is not.
func isAncestorCommit(repo *git.Repository, ancestor, descendant plumbing.Hash) (bool, error) {
	ancestorCommit, err := repo.CommitObject(ancestor)
	if stderrors.Is(err, plumbing.ErrObjectNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	descendantCommit, err := repo.CommitObject(descendant)
	if err != nil {
		return false, err
	}
	return ancestorCommit.IsAncestor(descendantCommit)
}

// remoteBranchHead returns the remote branch's commit, or the zero hash when
// the branch (or the whole repository) is empty.
func remoteBranchHead(ctx context.Context, remote *git.Remote, auth transport.AuthMethod, branch string) (plumbing.Hash, error) {
	refs, err := remote.ListContext(ctx, &git.ListOptions{Auth: auth})
	if stderrors.Is(err, transport.ErrEmptyRemoteRepository) {
		return plumbing.ZeroHash, nil
	}
	if err != nil {
		return plumbing.ZeroHash, err
	}
	name := plumbing.NewBranchReferenceName(branch)
	for _, ref := range refs {
		if ref.Name() == name {
			return ref.Hash(), nil
		}
	}
	return plumbing.ZeroHash, nil
}

// gitTransportError turns a failed git listing or push into a typed error.
func gitTransportError(err error, settings *appconfig.GitHubSettings) error {
	switch {
	case stderrors.Is(err, transport.ErrAuthenticationRequired), stderrors.Is(err, transport.ErrAuthorizationFailed):
		return apierrors.NewValidationError(
			"GitHub rejected the token for pushing. It needs read and write access to the repository contents.").
			WithCause(err)
	case stderrors.Is(err, transport.ErrRepositoryNotFound):
		return repositoryNotFoundError(settings.Owner + "/" + settings.Repository).WithCause(err)
	case stderrors.Is(err, context.DeadlineExceeded):
		return apierrors.NewTimeoutError("push to GitHub").WithCause(err)
	}
	return apierrors.NewUnavailableError("GitHub").WithCause(err)
}

// pushToGitHub pushes the local HEAD to the configured branch. It checks the
// remote branch first, because go-git can't recognise a diverged remote it has
// never fetched: a missing branch is created, a remote that is behind is
// fast-forwarded, and a diverged one is replaced only with replaceRemote.
// Without it the result is SYNC_REMOTE_DIVERGED and the remote is untouched.
func (gs *GitHubService) pushToGitHub(replaceRemote bool) error {
	repo, err := gs.localRepository()
	if err != nil {
		return err
	}
	if gs.beforePush != nil {
		gs.beforePush()
	}

	githubSettings := gs.settings.GetGitHubSettings()

	head, err := repo.Head()
	if err != nil {
		return fmt.Errorf("failed to get current HEAD: %w", err)
	}

	token, err := gs.getToken()
	if err != nil {
		return fmt.Errorf("failed to get GitHub token: %w", err)
	}
	auth := &githttp.BasicAuth{Username: githubSettings.Owner, Password: token}

	remote, err := repo.Remote("origin")
	if err != nil {
		return fmt.Errorf("failed to get the origin remote: %w", err)
	}

	ctx, cancel := context.WithTimeout(gs.ctx, githubPushTimeout)
	defer cancel()

	remoteHead, err := remoteBranchHead(ctx, remote, auth, githubSettings.Branch)
	if err != nil {
		return gitTransportError(err, githubSettings)
	}

	action, err := decidePush(remoteHead, head.Hash(), func() (bool, error) {
		return isAncestorCommit(repo, remoteHead, head.Hash())
	})
	if err != nil {
		return fmt.Errorf("failed to compare with the remote branch: %w", err)
	}

	refSpec := fmt.Sprintf("refs/heads/%s:refs/heads/%s", head.Name().Short(), githubSettings.Branch)
	switch action {
	case pushNone:
		return nil
	case pushDiverged:
		if !replaceRemote {
			return apierrors.NewSyncRemoteDivergedError(githubSettings.Branch)
		}
		log.Printf("[GitHubService] Replacing the remote branch %s with the wiki's history", githubSettings.Branch)
		refSpec = "+" + refSpec
	}

	err = repo.PushContext(ctx, &git.PushOptions{
		RemoteName: "origin",
		RefSpecs:   []config.RefSpec{config.RefSpec(refSpec)},
		Auth:       auth,
	})
	if err != nil && !stderrors.Is(err, git.NoErrAlreadyUpToDate) {
		return gitTransportError(err, githubSettings)
	}
	return nil
}

func (gs *GitHubService) Disconnect() error {
	log.Printf("[GitHubService] Disconnecting GitHub integration...")

	githubSettings := &appconfig.GitHubSettings{
		Enabled:    false,
		Owner:      "",
		Repository: "",
		Branch:     "",
		AutoSync:   false,
		SyncOnSave: false,
		Token:      nil,
	}

	if err := gs.settings.UpdateGitHubSettings(gs.dataDir, githubSettings); err != nil {
		log.Printf("[GitHubService] Failed to clear GitHub settings: %v", err)
		return fmt.Errorf("failed to clear GitHub settings: %w", err)
	}

	gs.setClient(nil)

	log.Printf("[GitHubService] Successfully disconnected GitHub integration")
	return nil
}

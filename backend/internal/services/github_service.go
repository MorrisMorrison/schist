package services

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/google/go-github/v57/github"
	"golang.org/x/oauth2"

	appconfig "github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/crypto"
)

const (
	DefaultGitHubBranch = "main"

	// githubRequestTimeout bounds each individual GitHub API / network call so a
	// hung endpoint cannot block a request (or a status poll) indefinitely.
	githubRequestTimeout = 30 * time.Second
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
}

type GitHubSettings struct {
	Enabled       bool      `json:"enabled"`
	Owner         string    `json:"owner"`
	Repository    string    `json:"repository"`
	Branch        string    `json:"branch"`
	AutoSync      bool      `json:"auto_sync"`
	SyncOnSave    bool      `json:"sync_on_save"`
	LastSync      time.Time `json:"last_sync,omitempty"`
	LastSyncError string    `json:"last_sync_error,omitempty"`
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
}

type GitHubConfigRequest struct {
	AutoSync   *bool   `json:"auto_sync,omitempty"`
	SyncOnSave *bool   `json:"sync_on_save,omitempty"`
	Branch     *string `json:"branch,omitempty"`
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

	githubSettings := settings.GetGitHubSettings()
	if githubSettings.Enabled && service.hasToken() {
		if _, err := service.ensureClient(); err != nil {
			fmt.Printf("Warning: failed to initialize GitHub client: %v\n", err)
		}
	}

	return service
}

func (gs *GitHubService) hasToken() bool {
	githubSettings := gs.settings.GetGitHubSettings()
	return githubSettings.Token != nil && (crypto.IsPlaintext(githubSettings.Token) || gs.secretManager.IsUnlocked())
}

func (gs *GitHubService) getToken() (string, error) {
	githubSettings := gs.settings.GetGitHubSettings()
	if githubSettings.Token == nil {
		return "", fmt.Errorf("github token not configured")
	}

	if crypto.IsPlaintext(githubSettings.Token) {
		return githubSettings.Token.Value, nil
	}

	if !gs.secretManager.IsUnlocked() {
		return "", fmt.Errorf("secret store is locked, please unlock first")
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
		return fmt.Errorf("github token is required")
	}
	if owner == "" {
		return fmt.Errorf("repository owner is required")
	}
	if repo == "" {
		return fmt.Errorf("repository name is required")
	}
	return nil
}

func (gs *GitHubService) SetupRepository(req *GitHubSetupRequest) (*GitHubRepoInfo, error) {
	if err := validateRepoFields(req.Token, req.Owner, req.Repo); err != nil {
		return nil, err
	}

	tempClient := newGitHubClient(gs.ctx, req.Token)

	getCtx, getCancel := gs.requestContext()
	repo, _, err := tempClient.Repositories.Get(getCtx, req.Owner, req.Repo)
	getCancel()
	if err != nil {
		return nil, fmt.Errorf("failed to access repository %s/%s: %w", req.Owner, req.Repo, err)
	}

	branch := req.Branch
	if branch == "" {
		branch = "main"
		if repo.DefaultBranch != nil {
			branch = *repo.DefaultBranch
		}
	}

	branchCtx, branchCancel := gs.requestContext()
	_, _, err = tempClient.Repositories.GetBranch(branchCtx, req.Owner, req.Repo, branch, 1)
	branchCancel()
	if err != nil {
		return nil, fmt.Errorf("branch %s not found in repository %s/%s: %w", branch, req.Owner, req.Repo, err)
	}

	if !gs.secretManager.IsUnlocked() {
		return nil, fmt.Errorf("secret store must be unlocked to save GitHub token")
	}

	githubSettings := &appconfig.GitHubSettings{
		Enabled:    true,
		Owner:      req.Owner,
		Repository: req.Repo,
		Branch:     branch,
		AutoSync:   req.AutoSync,
		SyncOnSave: req.SyncOnSave,
	}

	if err := gs.secretManager.SetGitHubToken(req.Token); err != nil {
		return nil, fmt.Errorf("failed to encrypt GitHub token: %w", err)
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
		Enabled:       githubSettings.Enabled,
		Owner:         githubSettings.Owner,
		Repository:    githubSettings.Repository,
		Branch:        githubSettings.Branch,
		AutoSync:      githubSettings.AutoSync,
		SyncOnSave:    githubSettings.SyncOnSave,
		LastSync:      githubSettings.LastSync,
		LastSyncError: "", // This field doesn't exist in config, handled separately
	}
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
			return status, fmt.Errorf("failed to initialize GitHub client: %w", err)
		}
	}

	if client == nil {
		return status, nil
	}

	// Test connection to repository
	githubSettings := gs.settings.GetGitHubSettings()
	if githubSettings.Owner != "" && githubSettings.Repository != "" {
		ctx, cancel := gs.requestContext()
		_, _, err := client.Repositories.Get(ctx, githubSettings.Owner, githubSettings.Repository)
		cancel()
		status.Connected = err == nil

		if err != nil {
			return status, fmt.Errorf("repository connection failed: %w", err)
		}
	}

	if gs.gitService != nil {
		status.PendingChanges = 0
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
		return fmt.Errorf("github integration is not enabled")
	}

	if req.Branch != nil && *req.Branch != "" {
		if client := gs.currentClient(); client != nil {
			ctx, cancel := gs.requestContext()
			_, _, err := client.Repositories.GetBranch(
				ctx, githubSettings.Owner, githubSettings.Repository, *req.Branch, 1)
			cancel()
			if err != nil {
				return fmt.Errorf("branch %s not found in repository: %w", *req.Branch, err)
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
		if req.Branch != nil && *req.Branch != "" {
			st.GitHub.Branch = *req.Branch
		}
		return nil
	})
}

func (gs *GitHubService) SyncToGitHub() (*GitHubSyncResult, error) {
	log.Printf("[GitHubService] Starting GitHub sync process...")

	githubSettings := gs.settings.GetGitHubSettings()

	if !githubSettings.Enabled {
		log.Printf("[GitHubService] ERROR: GitHub integration is not enabled")
		return nil, fmt.Errorf("github integration is not enabled")
	}

	client := gs.currentClient()
	if client == nil {
		log.Printf("[GitHubService] GitHub client not initialized, attempting to initialize...")
		var err error
		if client, err = gs.ensureClient(); err != nil {
			log.Printf("[GitHubService] ERROR: Failed to initialize GitHub client: %v", err)
			return nil, fmt.Errorf("failed to initialize github client: %w", err)
		}
		log.Printf("[GitHubService] GitHub client initialized successfully")
	}

	if gs.gitService == nil {
		log.Printf("[GitHubService] ERROR: Git service is not available")
		return nil, fmt.Errorf("git service not available")
	}

	log.Printf("[GitHubService] Running Git service health check...")
	if err := gs.gitService.HealthCheckWithRepair(false); err != nil {
		log.Printf("[GitHubService] Health check failed, attempting auto-repair...")
		if repairErr := gs.gitService.HealthCheckWithRepair(true); repairErr != nil {
			log.Printf("[GitHubService] ERROR: Git service health check failed even after repair: %v", repairErr)
			return nil, fmt.Errorf("git repository could not be initialized or repaired: %w", repairErr)
		}
		log.Printf("[GitHubService] Git service health check passed after repair")
	} else {
		log.Printf("[GitHubService] Git service health check passed")
	}

	result := &GitHubSyncResult{
		Timestamp: time.Now().Format(time.RFC3339),
	}

	// fail ends the sync with a failed result (not an error): message, plus
	// the lower-cased message and the cause as the reported error.
	fail := func(message string, err error) (*GitHubSyncResult, error) {
		log.Printf("[GitHubService] ERROR: %s: %v", message, err)
		result.Message = message
		result.Errors = []string{fmt.Sprintf("%s: %v", strings.ToLower(message), err)}
		return result, nil
	}

	log.Printf("[GitHubService] Verifying GitHub repository access...")
	verifyCtx, verifyCancel := gs.requestContext()
	_, _, err := client.Repositories.Get(verifyCtx, githubSettings.Owner, githubSettings.Repository)
	verifyCancel()
	if err != nil {
		return fail("Failed to connect to GitHub repository", err)
	}
	log.Printf("[GitHubService] GitHub repository access verified")

	log.Printf("[GitHubService] Setting up Git remote...")
	if err := gs.setupGitRemote(); err != nil {
		return fail("Failed to setup Git remote", err)
	}
	log.Printf("[GitHubService] Git remote setup completed")

	log.Printf("[GitHubService] Committing uncommitted changes...")
	if err := gs.commitUncommittedChanges(); err != nil {
		return fail("Failed to commit uncommitted changes", err)
	}
	log.Printf("[GitHubService] Uncommitted changes committed")

	log.Printf("[GitHubService] Counting local commits...")
	commitsBefore, err := gs.countLocalCommits()
	if err != nil {
		return fail("Failed to count local commits", err)
	}
	log.Printf("[GitHubService] Found %d local commits", commitsBefore)

	log.Printf("[GitHubService] Pushing to GitHub...")
	if err := gs.pushToGitHub(); err != nil {
		return fail("Failed to push to GitHub", err)
	}
	log.Printf("[GitHubService] Successfully pushed to GitHub")

	// Only touch LastSync: githubSettings is a snapshot from before the sync
	// and writing it back whole could undo changes made meanwhile.
	now := time.Now()
	if err := gs.settings.Update(gs.dataDir, func(st *appconfig.Settings) error {
		st.GitHub.LastSync = now
		return nil
	}); err != nil {
		log.Printf("[GitHubService] Warning: failed to update last sync time: %v", err)
	}

	result.Success = true
	result.Message = "GitHub sync completed successfully"
	result.SyncedFiles = 0 // We sync the entire repository, not individual files

	log.Printf("[GitHubService] GitHub sync completed successfully")
	return result, nil
}

func (gs *GitHubService) TestConnection(token, owner, repo, branch string) error {
	if err := validateRepoFields(token, owner, repo); err != nil {
		return err
	}

	if branch == "" {
		branch = "main"
	}

	tempClient := newGitHubClient(gs.ctx, token)

	getCtx, getCancel := gs.requestContext()
	repoInfo, _, err := tempClient.Repositories.Get(getCtx, owner, repo)
	getCancel()
	if err != nil {
		return fmt.Errorf("failed to access repository %s/%s: %w", owner, repo, err)
	}

	if branch == "main" && repoInfo.DefaultBranch != nil {
		branch = *repoInfo.DefaultBranch
	}

	branchCtx, branchCancel := gs.requestContext()
	_, _, err = tempClient.Repositories.GetBranch(branchCtx, owner, repo, branch, 1)
	branchCancel()
	if err != nil {
		return fmt.Errorf("failed to access branch %s: %w", branch, err)
	}

	return nil
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

func (gs *GitHubService) pushToGitHub() error {
	repo, err := gs.localRepository()
	if err != nil {
		return err
	}

	githubSettings := gs.settings.GetGitHubSettings()

	head, err := repo.Head()
	if err != nil {
		return fmt.Errorf("failed to get current HEAD: %w", err)
	}

	currentBranch := head.Name().Short()
	log.Printf("[GitHubService] Current local branch: %s, target branch: %s", currentBranch, githubSettings.Branch)

	token, err := gs.getToken()
	if err != nil {
		return fmt.Errorf("failed to get GitHub token: %w", err)
	}

	auth := &http.BasicAuth{
		Username: githubSettings.Owner,
		Password: token,
	}

	log.Printf("[GitHubService] Pushing to remote: %s", remoteURL(githubSettings))

	refSpec := fmt.Sprintf("refs/heads/%s:refs/heads/%s", currentBranch, githubSettings.Branch)
	log.Printf("[GitHubService] Using refspec: %s", refSpec)

	// Force-push is opt-in and off by default. The safe default is a fast-forward
	// only push: an unconditional force with a wildcard refspec after staging
	// everything (AddGlob ".") can silently overwrite commits on the remote branch.
	// When ForcePush is disabled and the remote has diverged, go-git returns a
	// non-fast-forward error and we surface it instead of clobbering. A user who
	// knowingly wants force-push can enable the persisted ForcePush setting.
	if githubSettings.ForcePush {
		log.Printf("[GitHubService] ForcePush enabled: pushing with force (may overwrite remote history)")
	}
	pushOptions := &git.PushOptions{
		RemoteName: "origin",
		RefSpecs: []config.RefSpec{
			config.RefSpec(refSpec),
		},
		Auth:  auth,
		Force: githubSettings.ForcePush,
	}

	pushCtx, pushCancel := gs.requestContext()
	defer pushCancel()
	err = repo.PushContext(pushCtx, pushOptions)
	if err != nil {
		if err == git.NoErrAlreadyUpToDate {
			log.Printf("[GitHubService] Repository is already up to date")
			return nil
		}
		log.Printf("[GitHubService] Push failed with error: %v", err)
		return fmt.Errorf("failed to push to GitHub: %w", err)
	}

	log.Printf("[GitHubService] Push completed successfully to %s branch", githubSettings.Branch)
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

package services

import (
	"context"
	"fmt"
	"log"
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
)

type GitHubService struct {
	config        *appconfig.Config
	settings      *appconfig.Settings
	client        *github.Client
	gitService    *GitService
	secretManager *SecretManager
	ctx           context.Context
	dataDir       string
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
		if err := service.initializeClient(); err != nil {
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

func (gs *GitHubService) initializeClient() error {
	token, err := gs.getToken()
	if err != nil {
		return err
	}

	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)
	tc := oauth2.NewClient(gs.ctx, ts)
	gs.client = github.NewClient(tc)

	return nil
}

func (gs *GitHubService) SetupRepository(req *GitHubSetupRequest) (*GitHubRepoInfo, error) {
	if req.Token == "" {
		return nil, fmt.Errorf("github token is required")
	}

	if req.Owner == "" {
		return nil, fmt.Errorf("repository owner is required")
	}

	if req.Repo == "" {
		return nil, fmt.Errorf("repository name is required")
	}

	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: req.Token},
	)
	tc := oauth2.NewClient(gs.ctx, ts)
	tempClient := github.NewClient(tc)

	repo, _, err := tempClient.Repositories.Get(gs.ctx, req.Owner, req.Repo)
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

	_, _, err = tempClient.Repositories.GetBranch(gs.ctx, req.Owner, req.Repo, branch, 1)
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

	currentSettings := gs.settings.GetGitHubSettings()
	githubSettings.Token = currentSettings.Token

	if err := gs.settings.UpdateGitHubSettings(gs.dataDir, githubSettings); err != nil {
		return nil, fmt.Errorf("failed to save GitHub config: %w", err)
	}

	gs.client = tempClient

	if err := gs.setupGitRemote(); err != nil {
		return nil, fmt.Errorf("failed to setup git remote: %w", err)
	}

	repoInfo := &GitHubRepoInfo{
		Owner:    req.Owner,
		Name:     req.Repo,
		FullName: *repo.FullName,
		Private:  *repo.Private,
		HTMLURL:  *repo.HTMLURL,
		CloneURL: *repo.CloneURL,
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
	if gs.client == nil && gs.hasToken() {
		if err := gs.initializeClient(); err != nil {
			return status, fmt.Errorf("failed to initialize GitHub client: %w", err)
		}
	}

	if gs.client == nil {
		return status, nil
	}

	// Test connection to repository
	githubSettings := gs.settings.GetGitHubSettings()
	if githubSettings.Owner != "" && githubSettings.Repository != "" {
		_, _, err := gs.client.Repositories.Get(gs.ctx, githubSettings.Owner, githubSettings.Repository)
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

	updatedConfig := *githubSettings

	if req.AutoSync != nil {
		updatedConfig.AutoSync = *req.AutoSync
	}

	if req.SyncOnSave != nil {
		updatedConfig.SyncOnSave = *req.SyncOnSave
	}

	if req.Branch != nil && *req.Branch != "" {
		if gs.client != nil {
			_, _, err := gs.client.Repositories.GetBranch(
				gs.ctx, githubSettings.Owner, githubSettings.Repository, *req.Branch, 1)
			if err != nil {
				return fmt.Errorf("branch %s not found in repository: %w", *req.Branch, err)
			}
		}
		updatedConfig.Branch = *req.Branch
	}

	return gs.settings.UpdateGitHubSettings(gs.dataDir, &updatedConfig)
}

func (gs *GitHubService) SyncToGitHub() (*GitHubSyncResult, error) {
	log.Printf("[GitHubService] Starting GitHub sync process...")

	githubSettings := gs.settings.GetGitHubSettings()

	if !githubSettings.Enabled {
		log.Printf("[GitHubService] ERROR: GitHub integration is not enabled")
		return nil, fmt.Errorf("github integration is not enabled")
	}

	if gs.client == nil {
		log.Printf("[GitHubService] GitHub client not initialized, attempting to initialize...")
		if err := gs.initializeClient(); err != nil {
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

	log.Printf("[GitHubService] Verifying GitHub repository access...")
	_, _, err := gs.client.Repositories.Get(gs.ctx, githubSettings.Owner, githubSettings.Repository)
	if err != nil {
		log.Printf("[GitHubService] ERROR: Failed to access GitHub repository %s/%s: %v",
			githubSettings.Owner, githubSettings.Repository, err)
		result.Message = "Failed to connect to GitHub repository"
		result.Errors = []string{fmt.Sprintf("failed to connect to github repository: %v", err)}
		return result, nil
	}
	log.Printf("[GitHubService] GitHub repository access verified")

	log.Printf("[GitHubService] Setting up Git remote...")
	if err := gs.setupGitRemote(); err != nil {
		log.Printf("[GitHubService] ERROR: Failed to setup Git remote: %v", err)
		result.Message = "Failed to setup Git remote"
		result.Errors = []string{fmt.Sprintf("failed to setup git remote: %v", err)}
		return result, nil
	}
	log.Printf("[GitHubService] Git remote setup completed")

	log.Printf("[GitHubService] Committing uncommitted changes...")
	if err := gs.commitUncommittedChanges(); err != nil {
		log.Printf("[GitHubService] ERROR: Failed to commit changes: %v", err)
		result.Message = "Failed to commit uncommitted changes"
		result.Errors = []string{fmt.Sprintf("failed to commit uncommitted changes: %v", err)}
		return result, nil
	}
	log.Printf("[GitHubService] Uncommitted changes committed")

	log.Printf("[GitHubService] Counting local commits...")
	commitsBefore, err := gs.countLocalCommits()
	if err != nil {
		log.Printf("[GitHubService] ERROR: Failed to count commits: %v", err)
		result.Message = "Failed to count local commits"
		result.Errors = []string{fmt.Sprintf("failed to count local commits: %v", err)}
		return result, nil
	}
	log.Printf("[GitHubService] Found %d local commits", commitsBefore)

	log.Printf("[GitHubService] Pushing to GitHub...")
	if err := gs.pushToGitHub(); err != nil {
		log.Printf("[GitHubService] ERROR: Failed to push to GitHub: %v", err)
		result.Message = "Failed to push to GitHub"
		result.Errors = []string{fmt.Sprintf("failed to push to github: %v", err)}
		return result, nil
	}
	log.Printf("[GitHubService] Successfully pushed to GitHub")

	githubSettings.LastSync = time.Now()
	if err := gs.settings.UpdateGitHubSettings(gs.dataDir, githubSettings); err != nil {
		log.Printf("[GitHubService] Warning: failed to update last sync time: %v", err)
	}

	result.Success = true
	result.Message = "GitHub sync completed successfully"
	result.SyncedFiles = 0 // We sync the entire repository, not individual files

	log.Printf("[GitHubService] GitHub sync completed successfully")
	return result, nil
}

func (gs *GitHubService) ValidateAccess() error {
	githubSettings := gs.settings.GetGitHubSettings()

	if !githubSettings.Enabled {
		return fmt.Errorf("github integration is not enabled")
	}

	if gs.client == nil {
		if err := gs.initializeClient(); err != nil {
			return fmt.Errorf("failed to initialize github client: %w", err)
		}
	}

	_, _, err := gs.client.Repositories.Get(gs.ctx, githubSettings.Owner, githubSettings.Repository)
	if err != nil {
		return fmt.Errorf("failed to access repository %s/%s: %w", githubSettings.Owner, githubSettings.Repository, err)
	}

	_, _, err = gs.client.Repositories.GetBranch(
		gs.ctx, githubSettings.Owner, githubSettings.Repository, githubSettings.Branch, 1,
	)
	if err != nil {
		return fmt.Errorf("failed to access branch %s: %w", githubSettings.Branch, err)
	}

	return nil
}

func (gs *GitHubService) TestConnection(token, owner, repo, branch string) error {
	if token == "" {
		return fmt.Errorf("github token is required")
	}
	if owner == "" {
		return fmt.Errorf("repository owner is required")
	}
	if repo == "" {
		return fmt.Errorf("repository name is required")
	}

	if branch == "" {
		branch = "main"
	}

	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)
	tc := oauth2.NewClient(gs.ctx, ts)
	tempClient := github.NewClient(tc)

	repoInfo, _, err := tempClient.Repositories.Get(gs.ctx, owner, repo)
	if err != nil {
		return fmt.Errorf("failed to access repository %s/%s: %w", owner, repo, err)
	}

	if branch == "main" && repoInfo.DefaultBranch != nil {
		branch = *repoInfo.DefaultBranch
	}

	_, _, err = tempClient.Repositories.GetBranch(gs.ctx, owner, repo, branch, 1)
	if err != nil {
		return fmt.Errorf("failed to access branch %s: %w", branch, err)
	}

	return nil
}

func (gs *GitHubService) GetRepositoryInfo() (*GitHubRepoInfo, error) {
	githubSettings := gs.settings.GetGitHubSettings()

	if !githubSettings.Enabled {
		return nil, fmt.Errorf("github integration is not enabled")
	}

	if gs.client == nil {
		if err := gs.initializeClient(); err != nil {
			return nil, fmt.Errorf("failed to initialize github client: %w", err)
		}
	}

	repo, _, err := gs.client.Repositories.Get(gs.ctx, githubSettings.Owner, githubSettings.Repository)
	if err != nil {
		return nil, fmt.Errorf("failed to get repository info: %w", err)
	}

	repoInfo := &GitHubRepoInfo{
		Owner:    githubSettings.Owner,
		Name:     githubSettings.Repository,
		FullName: *repo.FullName,
		Private:  *repo.Private,
		HTMLURL:  *repo.HTMLURL,
		CloneURL: *repo.CloneURL,
	}

	if repo.Description != nil {
		repoInfo.Description = *repo.Description
	}

	return repoInfo, nil
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

func (gs *GitHubService) setupGitRemote() error {
	if gs.gitService == nil || gs.gitService.repository == nil {
		return fmt.Errorf("git service or repository not available")
	}

	githubSettings := gs.settings.GetGitHubSettings()

	remoteURL := fmt.Sprintf("https://github.com/%s/%s.git",
		githubSettings.Owner,
		githubSettings.Repository)

	cfg, err := gs.gitService.repository.Config()
	if err != nil {
		return fmt.Errorf("failed to get repository config: %w", err)
	}

	cfg.Remotes["origin"] = &config.RemoteConfig{
		Name: "origin",
		URLs: []string{remoteURL},
	}

	err = gs.gitService.repository.Storer.SetConfig(cfg)
	if err != nil {
		return fmt.Errorf("failed to persist git config: %w", err)
	}

	verifyConfig, err := gs.gitService.repository.Config()
	if err != nil {
		return fmt.Errorf("failed to verify git config: %w", err)
	}

	if remote, exists := verifyConfig.Remotes["origin"]; !exists || len(remote.URLs) == 0 || remote.URLs[0] != remoteURL {
		return fmt.Errorf("failed to set git remote - verification failed")
	}

	return nil
}

func (gs *GitHubService) commitUncommittedChanges() error {
	if gs.gitService == nil || gs.gitService.repository == nil {
		return fmt.Errorf("git service or repository not available")
	}

	worktree, err := gs.gitService.repository.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	status, err := worktree.Status()
	if err != nil {
		return fmt.Errorf("failed to get worktree status: %w", err)
	}

	if status.IsClean() {
		return nil
	}

	err = worktree.AddGlob(".")
	if err != nil {
		return fmt.Errorf("failed to add files to staging: %w", err)
	}

	signature := &object.Signature{
		Name:  "Schist Sync",
		Email: "sync@schist.local",
		When:  time.Now(),
	}

	_, err = worktree.Commit("Sync: commit changes before GitHub sync", &git.CommitOptions{
		Author: signature,
	})
	if err != nil {
		return fmt.Errorf("failed to commit changes: %w", err)
	}

	return nil
}

func (gs *GitHubService) countLocalCommits() (int, error) {
	if gs.gitService == nil || gs.gitService.repository == nil {
		return 0, fmt.Errorf("git service or repository not available")
	}

	commitIter, err := gs.gitService.repository.Log(&git.LogOptions{})
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
	if gs.gitService == nil || gs.gitService.repository == nil {
		return fmt.Errorf("git service or repository not available")
	}

	githubSettings := gs.settings.GetGitHubSettings()

	head, err := gs.gitService.repository.Head()
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

	remoteURL := fmt.Sprintf("https://github.com/%s/%s.git", githubSettings.Owner, githubSettings.Repository)
	log.Printf("[GitHubService] Pushing to remote: %s", remoteURL)

	refSpec := fmt.Sprintf("refs/heads/%s:refs/heads/%s", currentBranch, githubSettings.Branch)
	log.Printf("[GitHubService] Using refspec: %s", refSpec)

	pushOptions := &git.PushOptions{
		RemoteName: "origin",
		RefSpecs: []config.RefSpec{
			config.RefSpec(refSpec),
		},
		Auth:  auth,
		Force: true,
	}

	err = gs.gitService.repository.Push(pushOptions)
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

	gs.client = nil

	log.Printf("[GitHubService] Successfully disconnected GitHub integration")
	return nil
}

package services

import (
	"context"
	"fmt"
	"time"

	"github.com/google/go-github/v57/github"
	"golang.org/x/oauth2"

	"github.com/MorrisMorrison/schist/internal/config"
)

type GitHubService struct {
	config     *config.Config
	client     *github.Client
	gitService *GitService
	ctx        context.Context
}

type GitHubSyncStatus struct {
	Enabled        bool      `json:"enabled"`
	Connected      bool      `json:"connected"`
	Owner          string    `json:"owner"`
	Repository     string    `json:"repository"`
	Branch         string    `json:"branch"`
	AutoSync       bool      `json:"auto_sync"`
	SyncOnSave     bool      `json:"sync_on_save"`
	LastSync       time.Time `json:"last_sync,omitempty"`
	LastSyncError  string    `json:"last_sync_error,omitempty"`
	PendingChanges int       `json:"pending_changes"`
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
	Success       bool   `json:"success"`
	FilesSync     int    `json:"files_synced"`
	CommitsSynced int    `json:"commits_synced"`
	Error         string `json:"error,omitempty"`
	SyncTime      string `json:"sync_time"`
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

func NewGitHubService(config *config.Config, gitService *GitService) *GitHubService {
	service := &GitHubService{
		config:     config,
		gitService: gitService,
		ctx:        context.Background(),
	}

	if config.GitHubEnabled && config.GitHubToken != "" {
		if err := service.initializeClient(); err != nil {
			fmt.Printf("Warning: failed to initialize GitHub client: %v\n", err)
		}
	}

	return service
}

func (gs *GitHubService) initializeClient() error {
	if gs.config.GitHubToken == "" {
		return fmt.Errorf("github token not configured")
	}

	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: gs.config.GitHubToken},
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

	gs.config.GitHubEnabled = true
	gs.config.GitHubToken = req.Token
	gs.config.GitHubOwner = req.Owner
	gs.config.GitHubRepo = req.Repo
	gs.config.GitHubBranch = branch
	gs.config.GitHubAutoSync = req.AutoSync
	gs.config.GitHubSyncOnSave = req.SyncOnSave

	gs.client = tempClient

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

func (gs *GitHubService) GetSyncStatus() (*GitHubSyncStatus, error) {
	status := &GitHubSyncStatus{
		Enabled:    gs.config.GitHubEnabled,
		Owner:      gs.config.GitHubOwner,
		Repository: gs.config.GitHubRepo,
		Branch:     gs.config.GitHubBranch,
		AutoSync:   gs.config.GitHubAutoSync,
		SyncOnSave: gs.config.GitHubSyncOnSave,
	}

	if !gs.config.GitHubEnabled || gs.client == nil {
		return status, nil
	}

	_, _, err := gs.client.Repositories.Get(gs.ctx, gs.config.GitHubOwner, gs.config.GitHubRepo)
	status.Connected = err == nil

	if err != nil {
		status.LastSyncError = fmt.Sprintf("connection error: %v", err)
	}

	if gs.gitService != nil {
		status.PendingChanges = 0
	}

	return status, nil
}

func (gs *GitHubService) UpdateConfiguration(req *GitHubConfigRequest) error {
	if !gs.config.GitHubEnabled {
		return fmt.Errorf("github integration is not enabled")
	}

	if req.AutoSync != nil {
		gs.config.GitHubAutoSync = *req.AutoSync
	}

	if req.SyncOnSave != nil {
		gs.config.GitHubSyncOnSave = *req.SyncOnSave
	}

	if req.Branch != nil && *req.Branch != "" {
		if gs.client != nil {
			_, _, err := gs.client.Repositories.GetBranch(gs.ctx, gs.config.GitHubOwner, gs.config.GitHubRepo, *req.Branch, 1)
			if err != nil {
				return fmt.Errorf("branch %s not found in repository: %w", *req.Branch, err)
			}
		}
		gs.config.GitHubBranch = *req.Branch
	}

	return nil
}

func (gs *GitHubService) SyncToGitHub() (*GitHubSyncResult, error) {
	if !gs.config.GitHubEnabled {
		return nil, fmt.Errorf("github integration is not enabled")
	}

	if gs.client == nil {
		if err := gs.initializeClient(); err != nil {
			return nil, fmt.Errorf("failed to initialize github client: %w", err)
		}
	}

	if gs.gitService == nil {
		return nil, fmt.Errorf("git service not available")
	}

	result := &GitHubSyncResult{
		SyncTime: time.Now().Format(time.RFC3339),
	}

	// This is a simplified implementation
	// In a full implementation, you would:
	// 1. Get local git repository state
	// 2. Compare with GitHub repository
	// 3. Push local commits to GitHub
	// 4. Handle merge conflicts
	// 5. Update local repository with GitHub changes

	// For now, we'll just verify the connection works
	_, _, err := gs.client.Repositories.Get(gs.ctx, gs.config.GitHubOwner, gs.config.GitHubRepo)
	if err != nil {
		result.Error = fmt.Sprintf("failed to connect to github repository: %v", err)
		return result, nil
	}

	result.Success = true
	result.FilesSync = 0     // Would be calculated during actual sync
	result.CommitsSynced = 0 // Would be calculated during actual sync

	return result, nil
}

func (gs *GitHubService) ValidateAccess() error {
	if !gs.config.GitHubEnabled {
		return fmt.Errorf("github integration is not enabled")
	}

	if gs.client == nil {
		if err := gs.initializeClient(); err != nil {
			return fmt.Errorf("failed to initialize github client: %w", err)
		}
	}

	// Test repository access
	_, _, err := gs.client.Repositories.Get(gs.ctx, gs.config.GitHubOwner, gs.config.GitHubRepo)
	if err != nil {
		return fmt.Errorf("failed to access repository %s/%s: %w", gs.config.GitHubOwner, gs.config.GitHubRepo, err)
	}

	// Test branch access
	_, _, err = gs.client.Repositories.GetBranch(
		gs.ctx, gs.config.GitHubOwner, gs.config.GitHubRepo, gs.config.GitHubBranch, 1,
	)
	if err != nil {
		return fmt.Errorf("failed to access branch %s: %w", gs.config.GitHubBranch, err)
	}

	return nil
}

func (gs *GitHubService) GetRepositoryInfo() (*GitHubRepoInfo, error) {
	if !gs.config.GitHubEnabled {
		return nil, fmt.Errorf("github integration is not enabled")
	}

	if gs.client == nil {
		if err := gs.initializeClient(); err != nil {
			return nil, fmt.Errorf("failed to initialize github client: %w", err)
		}
	}

	repo, _, err := gs.client.Repositories.Get(gs.ctx, gs.config.GitHubOwner, gs.config.GitHubRepo)
	if err != nil {
		return nil, fmt.Errorf("failed to get repository info: %w", err)
	}

	repoInfo := &GitHubRepoInfo{
		Owner:    gs.config.GitHubOwner,
		Name:     gs.config.GitHubRepo,
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
	return gs.config.GitHubEnabled
}

func (gs *GitHubService) ShouldSyncOnSave() bool {
	return gs.config.GitHubEnabled && gs.config.GitHubSyncOnSave
}

func (gs *GitHubService) ShouldAutoSync() bool {
	return gs.config.GitHubEnabled && gs.config.GitHubAutoSync
}

// TriggerSync can be called when a document is saved to potentially sync to GitHub
func (gs *GitHubService) TriggerSync(documentPath string) error {
	if !gs.ShouldSyncOnSave() {
		return nil // Nothing to do
	}

	// In a full implementation, you might:
	// 1. Queue the sync operation
	// 2. Batch multiple saves together
	// 3. Use channels to coordinate sync operations
	// For now, we'll just validate we can sync

	return gs.ValidateAccess()
}

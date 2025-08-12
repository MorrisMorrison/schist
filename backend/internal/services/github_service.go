package services

import (
	"context"
	"fmt"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/google/go-github/v57/github"
	"golang.org/x/oauth2"

	appconfig "github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/crypto"
	"github.com/MorrisMorrison/schist/internal/models"
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

type GitHubConfig struct {
	LastSyncTime time.Time `json:"last_sync_time"`
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

func (gs *GitHubService) GetSyncStatus() (*GitHubSyncStatus, error) {
	githubSettings := gs.settings.GetGitHubSettings()

	status := &GitHubSyncStatus{
		Enabled:    githubSettings.Enabled,
		Owner:      githubSettings.Owner,
		Repository: githubSettings.Repository,
		Branch:     githubSettings.Branch,
		AutoSync:   githubSettings.AutoSync,
		SyncOnSave: githubSettings.SyncOnSave,
		LastSync:   githubSettings.LastSync,
	}

	if !githubSettings.Enabled || gs.client == nil {
		return status, nil
	}

	_, _, err := gs.client.Repositories.Get(gs.ctx, githubSettings.Owner, githubSettings.Repository)
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
	githubSettings := gs.settings.GetGitHubSettings()

	if !githubSettings.Enabled {
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

	_, _, err := gs.client.Repositories.Get(gs.ctx, githubSettings.Owner, githubSettings.Repository)
	if err != nil {
		result.Error = fmt.Sprintf("failed to connect to github repository: %v", err)
		return result, nil
	}

	if err := gs.setupGitRemote(); err != nil {
		result.Error = fmt.Sprintf("failed to setup git remote: %v", err)
		return result, nil
	}

	if err := gs.commitUncommittedChanges(); err != nil {
		result.Error = fmt.Sprintf("failed to commit uncommitted changes: %v", err)
		return result, nil
	}

	commitsBefore, err := gs.countLocalCommits()
	if err != nil {
		result.Error = fmt.Sprintf("failed to count local commits: %v", err)
		return result, nil
	}

	if err := gs.pushToGitHub(); err != nil {
		result.Error = fmt.Sprintf("failed to push to github: %v", err)
		return result, nil
	}

	githubSettings.LastSync = time.Now()
	if err := gs.settings.UpdateGitHubSettings(gs.dataDir, githubSettings); err != nil {
		fmt.Printf("Warning: failed to update last sync time: %v\n", err)
	}

	result.Success = true
	result.FilesSync = 0 // We sync the entire repository, not individual files
	result.CommitsSynced = commitsBefore

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

	token, err := gs.getToken()
	if err != nil {
		return fmt.Errorf("failed to get GitHub token: %w", err)
	}

	auth := &http.BasicAuth{
		Username: githubSettings.Owner,
		Password: token,
	}

	pushOptions := &git.PushOptions{
		RemoteName: "origin",
		RefSpecs: []config.RefSpec{
			config.RefSpec(fmt.Sprintf("refs/heads/%s:refs/heads/%s", githubSettings.Branch, githubSettings.Branch)),
		},
		Auth:  auth,
		Force: true,
	}

	err = gs.gitService.repository.Push(pushOptions)
	if err != nil {
		if err == git.NoErrAlreadyUpToDate {
			return nil
		}
		return fmt.Errorf("failed to push to GitHub: %w", err)
	}

	return nil
}

func (gs *GitHubService) GetRepositoryStructure(owner, repo, path string) (*models.GitHubFolder, error) {
	if owner == "" {
		return nil, fmt.Errorf("repository owner is required")
	}
	if repo == "" {
		return nil, fmt.Errorf("repository name is required")
	}
	if path == "" {
		path = "docs"
	}

	branch := "main"

	if gs.client == nil {
		if err := gs.initializeClient(); err != nil {
			return nil, fmt.Errorf("failed to initialize github client: %w", err)
		}
	}

	options := &github.RepositoryContentGetOptions{
		Ref: branch,
	}
	_, dirContent, _, err := gs.client.Repositories.GetContents(gs.ctx, owner, repo, path, options)
	if err != nil {
		return nil, fmt.Errorf("failed to get repository contents at %s: %w", path, err)
	}

	folder := &models.GitHubFolder{
		Path:       path,
		Repository: repo,
		Owner:      owner,
		Branch:     branch,
		Files:      []models.GitHubDocument{},
		Folders:    []models.GitHubFolder{},
	}

	for _, content := range dirContent {
		if content.Type != nil {
			switch *content.Type {
			case "file":
				if content.Name != nil && content.SHA != nil && content.Size != nil {
					doc := models.GitHubDocument{
						Path:       *content.Path,
						SHA:        *content.SHA,
						Repository: repo,
						Owner:      owner,
						Branch:     branch,
						Size:       *content.Size,
					}
					folder.Files = append(folder.Files, doc)
				}
			case "dir":
				if content.Name != nil {
					subFolder := models.GitHubFolder{
						Path:       *content.Path,
						Repository: repo,
						Owner:      owner,
						Branch:     branch,
						Files:      []models.GitHubDocument{},
						Folders:    []models.GitHubFolder{},
					}
					folder.Folders = append(folder.Folders, subFolder)
				}
			}
		}
	}

	return folder, nil
}

func (gs *GitHubService) GetDocumentContent(owner, repo, path string) (*models.GitHubDocument, error) {
	if owner == "" {
		return nil, fmt.Errorf("repository owner is required")
	}
	if repo == "" {
		return nil, fmt.Errorf("repository name is required")
	}
	if path == "" {
		return nil, fmt.Errorf("file path is required")
	}

	branch := "main"

	if gs.client == nil {
		if err := gs.initializeClient(); err != nil {
			return nil, fmt.Errorf("failed to initialize github client: %w", err)
		}
	}

	options := &github.RepositoryContentGetOptions{
		Ref: branch,
	}
	fileContent, _, _, err := gs.client.Repositories.GetContents(gs.ctx, owner, repo, path, options)
	if err != nil {
		return nil, fmt.Errorf("failed to get file content at %s: %w", path, err)
	}

	if fileContent == nil {
		return nil, fmt.Errorf("file not found at path %s", path)
	}

	content, err := fileContent.GetContent()
	if err != nil {
		return nil, fmt.Errorf("failed to decode file content: %w", err)
	}

	doc := &models.GitHubDocument{
		Path:       path,
		Content:    content,
		SHA:        *fileContent.SHA,
		Repository: repo,
		Owner:      owner,
		Branch:     branch,
		Size:       *fileContent.Size,
	}

	return doc, nil
}

func (gs *GitHubService) ListDocsFiles(owner, repo string) ([]models.GitHubDocument, error) {
	if owner == "" {
		return nil, fmt.Errorf("repository owner is required")
	}
	if repo == "" {
		return nil, fmt.Errorf("repository name is required")
	}

	folder, err := gs.GetRepositoryStructure(owner, repo, "docs")
	if err != nil {
		return nil, fmt.Errorf("failed to get docs folder structure: %w", err)
	}

	var allFiles []models.GitHubDocument
	allFiles = append(allFiles, folder.Files...)

	for _, subFolder := range folder.Folders {
		subFolderContents, err := gs.GetRepositoryStructure(owner, repo, subFolder.Path)
		if err != nil {
			continue
		}
		allFiles = append(allFiles, subFolderContents.Files...)
	}

	return allFiles, nil
}

func (gs *GitHubService) AddDocsRepository(owner, repo, docsFolder string) error {
	if owner == "" {
		return fmt.Errorf("repository owner is required")
	}
	if repo == "" {
		return fmt.Errorf("repository name is required")
	}
	if docsFolder == "" {
		docsFolder = "docs"
	}

	if gs.client == nil {
		if err := gs.initializeClient(); err != nil {
			return fmt.Errorf("failed to initialize github client: %w", err)
		}
	}

	repoKey := fmt.Sprintf("%s/%s", owner, repo)
	settings := gs.settings.GetGitHubSettings()

	if settings.DocsRepos == nil {
		settings.DocsRepos = make(map[string]appconfig.GitHubRepoSettings)
	}

	settings.DocsRepos[repoKey] = appconfig.GitHubRepoSettings{
		Owner:         owner,
		Repository:    repo,
		DocsFolder:    docsFolder,
		LastSync:      time.Time{},
		SyncError:     "",
		DocumentCount: 0,
	}

	return gs.settings.UpdateGitHubSettings(gs.dataDir, settings)
}

func (gs *GitHubService) RemoveDocsRepository(owner, repo string) error {
	if owner == "" {
		return fmt.Errorf("repository owner is required")
	}
	if repo == "" {
		return fmt.Errorf("repository name is required")
	}

	repoKey := fmt.Sprintf("%s/%s", owner, repo)
	settings := gs.settings.GetGitHubSettings()

	if settings.DocsRepos != nil {
		delete(settings.DocsRepos, repoKey)
		return gs.settings.UpdateGitHubSettings(gs.dataDir, settings)
	}

	return nil
}

func (gs *GitHubService) GetDocsRepositories() ([]models.GitHubRepoConfig, error) {
	settings := gs.settings.GetGitHubSettings()
	var repos []models.GitHubRepoConfig

	if settings.DocsRepos == nil {
		return repos, nil
	}

	for _, repoSettings := range settings.DocsRepos {
		repo := models.GitHubRepoConfig{
			Owner:         repoSettings.Owner,
			Repository:    repoSettings.Repository,
			DocsFolder:    repoSettings.DocsFolder,
			LastSync:      repoSettings.LastSync,
			SyncError:     repoSettings.SyncError,
			DocumentCount: repoSettings.DocumentCount,
		}
		repos = append(repos, repo)
	}

	return repos, nil
}

func (gs *GitHubService) SyncDocsRepository(owner, repo string) error {
	if gs.client == nil {
		return fmt.Errorf("GitHub client not initialized")
	}

	if owner == "" || repo == "" {
		return fmt.Errorf("owner and repository are required")
	}

	settings := gs.settings.GetGitHubSettings()
	repoKey := fmt.Sprintf("%s/%s", owner, repo)

	if settings.DocsRepos == nil {
		return fmt.Errorf("repository %s not found in configured docs repositories", repoKey)
	}

	repoSettings, exists := settings.DocsRepos[repoKey]
	if !exists {
		return fmt.Errorf("repository %s not found in configured docs repositories", repoKey)
	}

	files, err := gs.ListDocsFiles(owner, repo)
	if err != nil {
		repoSettings.SyncError = err.Error()
		repoSettings.LastSync = time.Now()
		settings.DocsRepos[repoKey] = repoSettings
		_ = gs.settings.UpdateGitHubSettings(gs.dataDir, settings)
		return fmt.Errorf("failed to list docs files: %w", err)
	}

	repoSettings.DocumentCount = len(files)
	repoSettings.SyncError = ""
	repoSettings.LastSync = time.Now()
	settings.DocsRepos[repoKey] = repoSettings

	err = gs.settings.UpdateGitHubSettings(gs.dataDir, settings)
	if err != nil {
		return fmt.Errorf("failed to update sync status: %w", err)
	}

	return nil
}

func (gs *GitHubService) SyncAllDocsRepositories() (map[string]error, error) {
	repos, err := gs.GetDocsRepositories()
	if err != nil {
		return nil, fmt.Errorf("failed to get docs repositories: %w", err)
	}

	results := make(map[string]error)

	for _, repo := range repos {
		repoKey := fmt.Sprintf("%s/%s", repo.Owner, repo.Repository)
		err := gs.SyncDocsRepository(repo.Owner, repo.Repository)
		if err != nil {
			results[repoKey] = err
		} else {
			results[repoKey] = nil
		}
	}

	return results, nil
}

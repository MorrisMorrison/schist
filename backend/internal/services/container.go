package services

import (
	"fmt"

	"github.com/MorrisMorrison/schist/internal/config"
)

// Services contains all application services with their dependencies properly injected
type Services struct {
	// Configuration and settings
	Config   *config.Config
	Settings *config.Settings

	// Foundation services (no dependencies)
	AssetService  *AssetService
	IgnoreService *IgnoreService
	GitService    *GitService

	// Business services (with dependencies)
	DocumentService *DocumentService
	LinkService     *LinkService
	GitHubService   *GitHubService
}

// NewServices creates all services with proper dependency injection
// This eliminates service location anti-patterns and centralizes service creation
func NewServices() (*Services, error) {
	// 1. Load configuration (done once, passed to services that need it)
	appConfig := config.Load()
	dataDir := appConfig.DataDir

	settings, err := config.LoadSettings(dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to load settings: %w", err)
	}

	// 2. Create foundation services (no dependencies)
	assetService := NewAssetService(dataDir)
	ignoreService := NewIgnoreService(dataDir)

	// GitService can fail, so handle error properly
	gitService, err := NewGitService(dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to create git service: %w", err)
	}

	// 3. Create business services with explicit dependency injection
	documentService := NewDocumentService(dataDir, gitService, ignoreService)
	linkService := NewLinkService(documentService, ignoreService)
	gitHubService := NewGitHubService(appConfig, gitService, settings)

	return &Services{
		Config:          appConfig,
		Settings:        settings,
		AssetService:    assetService,
		IgnoreService:   ignoreService,
		GitService:      gitService,
		DocumentService: documentService,
		LinkService:     linkService,
		GitHubService:   gitHubService,
	}, nil
}

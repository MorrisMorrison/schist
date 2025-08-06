package services

import (
	"fmt"

	"github.com/MorrisMorrison/schist/internal/config"
)

type Services struct {
	Config   *config.Config
	Settings *config.Settings

	AssetService  *AssetService
	IgnoreService *IgnoreService
	GitService    *GitService

	DocumentService *DocumentService
	LinkService     *LinkService
	GitHubService   *GitHubService
	AuthService     *AuthService
}

func NewServices() (*Services, error) {
	appConfig := config.Load()
	dataDir := appConfig.DataDir

	settings, err := config.LoadSettings(dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to load settings: %w", err)
	}

	assetService := NewAssetService(dataDir)
	ignoreService := NewIgnoreService(dataDir)

	gitService, err := NewGitService(dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to create git service: %w", err)
	}

	documentService := NewDocumentService(dataDir, gitService, ignoreService)
	linkService := NewLinkService(documentService, ignoreService)
	gitHubService := NewGitHubService(appConfig, gitService, settings)
	authService := NewAuthService(appConfig)

	return &Services{
		Config:          appConfig,
		Settings:        settings,
		AssetService:    assetService,
		IgnoreService:   ignoreService,
		GitService:      gitService,
		DocumentService: documentService,
		LinkService:     linkService,
		GitHubService:   gitHubService,
		AuthService:     authService,
	}, nil
}

package services

import (
	"fmt"

	"github.com/MorrisMorrison/schist/internal/config"
)

type Services struct {
	Config         *config.Config
	Settings       *config.Settings
	SecretManager  *SecretManager
	PasskeyService *PasskeyService
	UserService    *UserService

	AssetService    *AssetService
	IgnoreService   *IgnoreService
	GitService      *GitService
	TemplateService *TemplateService

	DocumentService *DocumentService
	LinkService     *LinkService
	GitHubService   *GitHubService
	AuthService     *AuthService
	ShareService    *ShareService
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
	templateService := NewTemplateService(appConfig)

	gitService, err := NewGitService(dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to create git service: %w", err)
	}

	passkeyService, err := NewPasskeyService(appConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create passkey service: %w", err)
	}
	userService := NewUserService(dataDir)
	secretManager := NewSecretManager(settings, dataDir, passkeyService)
	documentService := NewDocumentService(dataDir, gitService, ignoreService)
	linkService := NewLinkService(documentService, ignoreService)
	gitHubService := NewGitHubService(appConfig, gitService, settings, secretManager)
	authService := NewAuthService(appConfig, userService)
	shareService := NewShareService(appConfig, documentService)

	return &Services{
		Config:          appConfig,
		Settings:        settings,
		SecretManager:   secretManager,
		PasskeyService:  passkeyService,
		UserService:     userService,
		AssetService:    assetService,
		IgnoreService:   ignoreService,
		GitService:      gitService,
		TemplateService: templateService,
		DocumentService: documentService,
		LinkService:     linkService,
		GitHubService:   gitHubService,
		AuthService:     authService,
		ShareService:    shareService,
	}, nil
}

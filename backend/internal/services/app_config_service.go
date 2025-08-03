package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// AppConfig represents the application configuration stored in data/.schist/config.json
type AppConfig struct {
	GitHub GitHubAppConfig `json:"github"`
	UI     UIConfig        `json:"ui"`
	System SystemConfig    `json:"system"`
}

type GitHubAppConfig struct {
	Enabled    bool      `json:"enabled"`
	Token      string    `json:"token,omitempty"` // TODO: Consider encryption
	Owner      string    `json:"owner,omitempty"`
	Repository string    `json:"repository,omitempty"`
	Branch     string    `json:"branch"`
	AutoSync   bool      `json:"auto_sync"`
	SyncOnSave bool      `json:"sync_on_save"`
	LastSync   time.Time `json:"last_sync,omitempty"`
}

type UIConfig struct {
	Theme string `json:"theme"` // "light", "dark", "auto"
}

type SystemConfig struct {
	Version   string    `json:"version"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type AppConfigService struct {
	dataDir    string
	configPath string
	config     *AppConfig
}

func NewAppConfigService(dataDir string) *AppConfigService {
	schistDir := filepath.Join(dataDir, ".schist")
	configPath := filepath.Join(schistDir, "config.json")

	return &AppConfigService{
		dataDir:    dataDir,
		configPath: configPath,
		config:     &AppConfig{},
	}
}

func (a *AppConfigService) Load() error {
	schistDir := filepath.Dir(a.configPath)
	if err := os.MkdirAll(schistDir, 0755); err != nil {
		return fmt.Errorf("failed to create .schist directory: %w", err)
	}

	if _, err := os.Stat(a.configPath); os.IsNotExist(err) {
		// Create default config
		a.config = a.createDefaultConfig()
		return a.Save()
	}

	data, err := os.ReadFile(a.configPath)
	if err != nil {
		return fmt.Errorf("failed to read config file: %w", err)
	}

	if err := json.Unmarshal(data, a.config); err != nil {
		return fmt.Errorf("failed to parse config file: %w", err)
	}

	return nil
}

func (a *AppConfigService) Save() error {
	a.config.System.UpdatedAt = time.Now()

	data, err := json.MarshalIndent(a.config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(a.configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

func (a *AppConfigService) GetGitHubConfig() *GitHubAppConfig {
	return &a.config.GitHub
}

func (a *AppConfigService) UpdateGitHubConfig(github *GitHubAppConfig) error {
	a.config.GitHub = *github
	return a.Save()
}

func (a *AppConfigService) GetUIConfig() *UIConfig {
	return &a.config.UI
}

func (a *AppConfigService) UpdateUIConfig(ui *UIConfig) error {
	a.config.UI = *ui
	return a.Save()
}

func (a *AppConfigService) GetSystemConfig() *SystemConfig {
	return &a.config.System
}

func (a *AppConfigService) MigrateFromEnvConfig(envConfig *GitHubAppConfig) error {
	if !a.config.GitHub.Enabled && envConfig.Enabled {
		a.config.GitHub = *envConfig
		return a.Save()
	}
	return nil
}

func (a *AppConfigService) createDefaultConfig() *AppConfig {
	now := time.Now()
	return &AppConfig{
		GitHub: GitHubAppConfig{
			Enabled: false,
			Branch:  "main",
		},
		UI: UIConfig{
			Theme: "auto",
		},
		System: SystemConfig{
			Version:   "1.0.0",
			CreatedAt: now,
			UpdatedAt: now,
		},
	}
}

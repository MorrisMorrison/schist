package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Settings handles JSON-based configuration stored in data/.schist/config.json
type Settings struct {
	GitHub GitHubSettings `json:"github"`
	UI     UISettings     `json:"ui"`
	System SystemSettings `json:"system"`
}

type GitHubSettings struct {
	Enabled    bool      `json:"enabled"`
	Token      string    `json:"token,omitempty"` // TODO: Consider encryption
	Owner      string    `json:"owner,omitempty"`
	Repository string    `json:"repository,omitempty"`
	Branch     string    `json:"branch"`
	AutoSync   bool      `json:"auto_sync"`
	SyncOnSave bool      `json:"sync_on_save"`
	LastSync   time.Time `json:"last_sync,omitempty"`
}

type UISettings struct {
	Theme string `json:"theme"` // "light", "dark", "auto"
}

type SystemSettings struct {
	Version   string    `json:"version"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// LoadSettings loads settings from JSON file in the specified data directory
func LoadSettings(dataDir string) (*Settings, error) {
	schistDir := filepath.Join(dataDir, ".schist")
	configPath := filepath.Join(schistDir, "config.json")

	// Ensure .schist directory exists
	if err := os.MkdirAll(schistDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create .schist directory: %w", err)
	}

	// If config file doesn't exist, create default
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		settings := createDefaultSettings()
		if err := settings.Save(dataDir); err != nil {
			return nil, fmt.Errorf("failed to save default settings: %w", err)
		}
		return settings, nil
	}

	// Read existing config
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var settings Settings
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	return &settings, nil
}

// Save saves settings to JSON file in the specified data directory
func (s *Settings) Save(dataDir string) error {
	s.System.UpdatedAt = time.Now()

	schistDir := filepath.Join(dataDir, ".schist")
	configPath := filepath.Join(schistDir, "config.json")

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// GetGitHubSettings returns GitHub configuration
func (s *Settings) GetGitHubSettings() *GitHubSettings {
	return &s.GitHub
}

// UpdateGitHubSettings updates GitHub configuration and saves to file
func (s *Settings) UpdateGitHubSettings(dataDir string, github *GitHubSettings) error {
	s.GitHub = *github
	return s.Save(dataDir)
}

// GetUISettings returns UI configuration
func (s *Settings) GetUISettings() *UISettings {
	return &s.UI
}

// UpdateUISettings updates UI configuration and saves to file
func (s *Settings) UpdateUISettings(dataDir string, ui *UISettings) error {
	s.UI = *ui
	return s.Save(dataDir)
}

// GetSystemSettings returns system configuration
func (s *Settings) GetSystemSettings() *SystemSettings {
	return &s.System
}

// MigrateFromEnvSettings migrates configuration from environment-based GitHub config
func (s *Settings) MigrateFromEnvSettings(dataDir string, envSettings *GitHubSettings) error {
	if !s.GitHub.Enabled && envSettings.Enabled {
		s.GitHub = *envSettings
		return s.Save(dataDir)
	}
	return nil
}

func createDefaultSettings() *Settings {
	now := time.Now()
	return &Settings{
		GitHub: GitHubSettings{
			Enabled: false,
			Branch:  "main",
		},
		UI: UISettings{
			Theme: "auto",
		},
		System: SystemSettings{
			Version:   "1.0.0",
			CreatedAt: now,
			UpdatedAt: now,
		},
	}
}

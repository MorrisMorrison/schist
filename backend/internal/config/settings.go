package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/MorrisMorrison/schist/internal/crypto"
	"github.com/MorrisMorrison/schist/internal/utils"
)

// Settings handles JSON-based configuration stored in data/.schist/config.json
type Settings struct {
	GitHub  GitHubSettings `json:"github"`
	UI      UISettings     `json:"ui"`
	System  SystemSettings `json:"system"`
	Secrets *SecretsConfig `json:"secrets,omitempty"`
}

type GitHubSettings struct {
	Enabled    bool                   `json:"enabled"`
	Token      *crypto.EncryptedValue `json:"token,omitempty"`
	Owner      string                 `json:"owner,omitempty"`
	Repository string                 `json:"repository,omitempty"`
	Branch     string                 `json:"branch"`
	AutoSync   bool                   `json:"auto_sync"`
	SyncOnSave bool                   `json:"sync_on_save"`
	// ForcePush opts in to force-pushing to the remote branch. It is false by
	// default, keeping the safe fast-forward-only push behavior. Only enable it
	// when you knowingly accept that remote history may be overwritten.
	ForcePush bool      `json:"force_push"`
	LastSync  time.Time `json:"last_sync,omitempty"`
}

type UISettings struct {
	Theme string `json:"theme"` // "light", "dark", "auto"
}

type SystemSettings struct {
	Version   string    `json:"version"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type SecretsConfig struct {
	Version       int                               `json:"version"`
	KeyDerivation string                            `json:"keyDerivation"`
	Salt          string                            `json:"salt"`
	Store         map[string]*crypto.EncryptedValue `json:"store,omitempty"`
}

func LoadSettings(dataDir string) (*Settings, error) {
	schistDir := filepath.Join(dataDir, ".schist")
	configPath := filepath.Join(schistDir, "config.json")

	if err := os.MkdirAll(schistDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create .schist directory: %w", err)
	}

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		settings := createDefaultSettings()
		if err := settings.Save(dataDir); err != nil {
			return nil, fmt.Errorf("failed to save default settings: %w", err)
		}
		return settings, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	settings, err := parseSettings(data)
	if err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	return settings, nil
}

func parseSettings(data []byte) (*Settings, error) {
	var rawConfig map[string]any
	if err := json.Unmarshal(data, &rawConfig); err != nil {
		return nil, err
	}

	// Configs written before the secret store kept the GitHub token as a bare
	// string, which can't unmarshal into *crypto.EncryptedValue. Pull it out
	// first and carry it over as a plaintext value so it can be migrated.
	var legacyToken string
	if githubConfig, ok := rawConfig["github"].(map[string]any); ok {
		if token, ok := githubConfig["token"].(string); ok {
			legacyToken = token
			delete(githubConfig, "token")
			var err error
			if data, err = json.Marshal(rawConfig); err != nil {
				return nil, err
			}
		}
	}

	var settings Settings
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, err
	}

	if legacyToken != "" {
		settings.GitHub.Token = crypto.NewEncryptedValue(legacyToken, false)
	}

	return &settings, nil
}

func (s *Settings) Save(dataDir string) error {
	s.System.UpdatedAt = time.Now()

	schistDir := filepath.Join(dataDir, ".schist")
	configPath := filepath.Join(schistDir, "config.json")

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Atomic write: config.json holds the secret-store salt and encrypted
	// secrets, so a torn write would make every stored secret unrecoverable.
	if err := utils.WriteFileAtomic(configPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

func (s *Settings) GetGitHubSettings() *GitHubSettings {
	return &s.GitHub
}

func (s *Settings) UpdateGitHubSettings(dataDir string, github *GitHubSettings) error {
	s.GitHub = *github
	return s.Save(dataDir)
}

func (s *Settings) GetUISettings() *UISettings {
	return &s.UI
}

func (s *Settings) UpdateUISettings(dataDir string, ui *UISettings) error {
	s.UI = *ui
	return s.Save(dataDir)
}

func (s *Settings) GetSystemSettings() *SystemSettings {
	return &s.System
}

func (s *Settings) GetSecretsConfig() *SecretsConfig {
	return s.Secrets
}

func (s *Settings) UpdateSecretsConfig(dataDir string, secrets *SecretsConfig) error {
	s.Secrets = secrets
	return s.Save(dataDir)
}

func (s *Settings) HasPlaintextSecrets() bool {
	return crypto.IsPlaintext(s.GitHub.Token)
}

func (s *Settings) MigratePlaintextSecrets(dataDir string, secureStore *crypto.SecureStore) error {
	if !s.HasPlaintextSecrets() {
		return nil
	}

	if s.GitHub.Token != nil && s.GitHub.Token.Value != "" {
		encrypted, err := secureStore.Encrypt(s.GitHub.Token.Value)
		if err != nil {
			return fmt.Errorf("failed to encrypt GitHub token: %w", err)
		}
		s.GitHub.Token = encrypted
	}

	return s.Save(dataDir)
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

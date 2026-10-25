package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/MorrisMorrison/schist/internal/crypto"
	"github.com/MorrisMorrison/schist/internal/utils"
)

// Settings handles JSON-based configuration stored in data/.schist/config.json.
//
// One *Settings is shared by every request, so it is safe for concurrent use:
// read it through the getters (which return copies) and change it through
// Update or the Update* helpers, which run under the write lock and save
// atomically. The exported fields exist for JSON and for single-goroutine
// setup and tests; concurrent code must not touch them directly.
//
// Lock order: a caller may hold SecretManager.mu while calling into Settings,
// never the other way round. Settings never calls out while holding mu.
type Settings struct {
	mu sync.RWMutex

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

// Save writes the settings to disk atomically.
func (s *Settings) Save(dataDir string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked(dataDir)
}

// saveLocked writes the settings; the caller holds s.mu for writing, so saves
// are serialised and the newest state is always the one on disk.
func (s *Settings) saveLocked(dataDir string) error {
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

// Update runs fn with exclusive access to the settings and saves them if fn
// returns nil. fn must not call other Settings methods (it would deadlock)
// and must not block: no network calls. If fn fails, nothing is saved; it
// should only change s once it can no longer fail.
func (s *Settings) Update(dataDir string, fn func(*Settings) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := fn(s); err != nil {
		return err
	}
	return s.saveLocked(dataDir)
}

// GetGitHubSettings returns a copy of the GitHub settings. The token pointer
// is shared: EncryptedValues are replaced, never changed in place.
func (s *Settings) GetGitHubSettings() *GitHubSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	github := s.GitHub
	return &github
}

func (s *Settings) UpdateGitHubSettings(dataDir string, github *GitHubSettings) error {
	return s.Update(dataDir, func(st *Settings) error {
		st.GitHub = *github
		return nil
	})
}

// GetUISettings returns a copy of the UI settings.
func (s *Settings) GetUISettings() *UISettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ui := s.UI
	return &ui
}

func (s *Settings) UpdateUISettings(dataDir string, ui *UISettings) error {
	return s.Update(dataDir, func(st *Settings) error {
		st.UI = *ui
		return nil
	})
}

// GetSystemSettings returns a copy of the system settings.
func (s *Settings) GetSystemSettings() *SystemSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	system := s.System
	return &system
}

// GetSecretsConfig returns a copy of the secrets config (nil if there is
// none), with its own Store map.
func (s *Settings) GetSecretsConfig() *SecretsConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Secrets.clone()
}

func (s *Settings) UpdateSecretsConfig(dataDir string, secrets *SecretsConfig) error {
	return s.Update(dataDir, func(st *Settings) error {
		st.Secrets = secrets.clone()
		return nil
	})
}

func (c *SecretsConfig) clone() *SecretsConfig {
	if c == nil {
		return nil
	}
	cp := *c
	if c.Store != nil {
		cp.Store = make(map[string]*crypto.EncryptedValue, len(c.Store))
		for k, v := range c.Store {
			cp.Store[k] = v
		}
	}
	return &cp
}

func (s *Settings) HasPlaintextSecrets() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return crypto.IsPlaintext(s.GitHub.Token)
}

// MigratePlaintextSecrets encrypts a plaintext GitHub token with secureStore
// and saves. Encryption is in-memory AES-GCM, so it runs under the lock.
func (s *Settings) MigratePlaintextSecrets(dataDir string, secureStore *crypto.SecureStore) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !crypto.IsPlaintext(s.GitHub.Token) {
		return nil
	}

	encrypted, err := secureStore.Encrypt(s.GitHub.Token.Value)
	if err != nil {
		return fmt.Errorf("failed to encrypt GitHub token: %w", err)
	}
	s.GitHub.Token = encrypted

	return s.saveLocked(dataDir)
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

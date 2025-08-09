package services

import (
	"encoding/base64"
	"fmt"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/crypto"
)

type SecretManager struct {
	store          *crypto.SecureStore
	settings       *config.Settings
	passkeyService *PasskeyService
	dataDir        string
	unlocked       bool
}

func NewSecretManager(settings *config.Settings, dataDir string, passkeyService *PasskeyService) *SecretManager {
	return &SecretManager{
		settings:       settings,
		passkeyService: passkeyService,
		dataDir:        dataDir,
		unlocked:       false,
	}
}

// Password-based unlock removed - using passkey-only authentication
// See UnlockWithPasskey() method below

func (sm *SecretManager) Lock() {
	if sm.store != nil {
		sm.store.Clear()
		sm.store = nil
	}
	sm.unlocked = false
}

func (sm *SecretManager) IsUnlocked() bool {
	return sm.unlocked && sm.store != nil
}

func (sm *SecretManager) SetSecret(key, value string) error {
	if !sm.IsUnlocked() {
		return fmt.Errorf("secret store is locked")
	}

	if key == "" {
		return fmt.Errorf("secret key cannot be empty")
	}

	encrypted, err := sm.store.Encrypt(value)
	if err != nil {
		return fmt.Errorf("failed to encrypt secret: %w", err)
	}

	secretsConfig := sm.settings.GetSecretsConfig()
	if secretsConfig == nil {
		return fmt.Errorf("secrets config not initialized")
	}

	if secretsConfig.Store == nil {
		secretsConfig.Store = make(map[string]*crypto.EncryptedValue)
	}

	secretsConfig.Store[key] = encrypted

	return sm.settings.UpdateSecretsConfig(sm.dataDir, secretsConfig)
}

func (sm *SecretManager) GetSecret(key string) (string, error) {
	if !sm.IsUnlocked() {
		return "", fmt.Errorf("secret store is locked")
	}

	secretsConfig := sm.settings.GetSecretsConfig()
	if secretsConfig == nil || secretsConfig.Store == nil {
		return "", fmt.Errorf("secret not found: %s", key)
	}

	encrypted, exists := secretsConfig.Store[key]
	if !exists {
		return "", fmt.Errorf("secret not found: %s", key)
	}

	return sm.store.Decrypt(encrypted)
}

func (sm *SecretManager) ListSecrets() ([]string, error) {
	if !sm.IsUnlocked() {
		return nil, fmt.Errorf("secret store is locked")
	}

	secretsConfig := sm.settings.GetSecretsConfig()
	if secretsConfig == nil || secretsConfig.Store == nil {
		return []string{}, nil
	}

	keys := make([]string, 0, len(secretsConfig.Store))
	for key := range secretsConfig.Store {
		keys = append(keys, key)
	}

	return keys, nil
}

func (sm *SecretManager) DeleteSecret(key string) error {
	if !sm.IsUnlocked() {
		return fmt.Errorf("secret store is locked")
	}

	secretsConfig := sm.settings.GetSecretsConfig()
	if secretsConfig == nil || secretsConfig.Store == nil {
		return fmt.Errorf("secret not found: %s", key)
	}

	if _, exists := secretsConfig.Store[key]; !exists {
		return fmt.Errorf("secret not found: %s", key)
	}

	delete(secretsConfig.Store, key)

	return sm.settings.UpdateSecretsConfig(sm.dataDir, secretsConfig)
}

func (sm *SecretManager) GetGitHubToken() (string, error) {
	if !sm.IsUnlocked() {
		return "", fmt.Errorf("secret store is locked")
	}

	if sm.settings.GitHub.Token == nil {
		return "", nil
	}

	return sm.store.Decrypt(sm.settings.GitHub.Token)
}

func (sm *SecretManager) SetGitHubToken(token string) error {
	if !sm.IsUnlocked() {
		return fmt.Errorf("secret store is locked")
	}

	encrypted, err := sm.store.Encrypt(token)
	if err != nil {
		return fmt.Errorf("failed to encrypt GitHub token: %w", err)
	}

	sm.settings.GitHub.Token = encrypted
	return sm.settings.Save(sm.dataDir)
}

func (sm *SecretManager) HasSecrets() bool {
	secretsConfig := sm.settings.GetSecretsConfig()
	return secretsConfig != nil && len(secretsConfig.Store) > 0
}

func (sm *SecretManager) UnlockWithPasskey(credentialID string) error {
	if sm.unlocked {
		return nil
	}

	// Initialize secrets config if it doesn't exist (similar to password unlock)
	secretsConfig := sm.settings.GetSecretsConfig()
	if secretsConfig == nil {
		salt, err := crypto.GenerateSalt()
		if err != nil {
			return fmt.Errorf("failed to generate salt: %w", err)
		}

		secretsConfig = &config.SecretsConfig{
			Version:       1,
			KeyDerivation: "passkey", // Different from password-based ("scrypt")
			Salt:          base64.StdEncoding.EncodeToString(salt),
			Store:         make(map[string]*crypto.EncryptedValue),
		}

		if err := sm.settings.UpdateSecretsConfig(sm.dataDir, secretsConfig); err != nil {
			return fmt.Errorf("failed to save secrets config: %w", err)
		}
	}

	encryptionKey, err := sm.passkeyService.GetEncryptionKey(credentialID)
	if err != nil {
		return fmt.Errorf("failed to get encryption key from passkey: %w", err)
	}

	salt := encryptionKey[:16]
	store, err := crypto.NewSecureStoreWithKey(encryptionKey, salt)
	if err != nil {
		return fmt.Errorf("failed to create secure store: %w", err)
	}

	if sm.settings.HasPlaintextSecrets() {
		if err := sm.settings.MigratePlaintextSecrets(sm.dataDir, store); err != nil {
			store.Clear()
			return fmt.Errorf("failed to migrate plaintext secrets: %w", err)
		}
	}

	sm.store = store
	sm.unlocked = true

	return nil
}

func (sm *SecretManager) CreatePasskey(name string) (string, error) {
	// Note: This is now handled through WebAuthn flow, not directly
	return "", fmt.Errorf("passkey creation now handled through WebAuthn registration flow")
}

func (sm *SecretManager) ListPasskeys() ([]PasskeyCredentialInfo, error) {
	return sm.passkeyService.ListCredentials()
}

func (sm *SecretManager) DeletePasskey(credentialID string) error {
	return sm.passkeyService.DeleteCredential(credentialID)
}

func (sm *SecretManager) HasPasskeys() (bool, error) {
	return sm.passkeyService.HasCredentials()
}

func (sm *SecretManager) RequiresPassword() bool {
	// Check if we have passkeys available - if so, don't require password
	hasPasskeys, _ := sm.passkeyService.HasCredentials()
	if hasPasskeys {
		return false
	}

	// If no passkeys, fall back to password-based logic
	return sm.settings.HasPlaintextSecrets() || sm.HasSecrets()
}

// RequiresSetup returns true if neither password nor passkey setup is complete
func (sm *SecretManager) RequiresSetup() bool {
	hasPasskeys, _ := sm.passkeyService.HasCredentials()
	hasSecrets := sm.HasSecrets() || sm.settings.HasPlaintextSecrets()

	// Setup is required if we have neither passkeys nor secrets configured
	return !hasPasskeys && !hasSecrets
}

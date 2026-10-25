package services

import (
	"encoding/base64"
	"fmt"
	"sync"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/crypto"
	"github.com/MorrisMorrison/schist/internal/errors"
)

// errSecretStoreLocked is returned by every secret operation while the store
// is locked (401, same as the RequireUnlockedSecrets middleware). A fresh
// value each time, since APIError's With* helpers mutate the receiver.
func errSecretStoreLocked() error {
	return errors.NewUnauthorizedError("secret store is locked")
}

// SecretManager holds the unlocked secret store. Requests run concurrently,
// so mu guards store and unlocked: operations that only use the store take
// the read lock for their whole duration (so Lock can't clear the key under
// them), and Lock, unlocking and writes take the write lock.
//
// Lock order: SecretManager.mu, then Settings' lock (taken inside the
// Settings methods). PasskeyService is only called with mu not held, and
// neither PasskeyService nor Settings calls back into SecretManager. Nothing
// that can block indefinitely (network) runs under mu; the work done under
// it is in-memory AES-GCM plus the atomic config.json write.
type SecretManager struct {
	mu             sync.RWMutex
	store          *crypto.SecureStore
	unlocked       bool
	settings       *config.Settings
	passkeyService *PasskeyService
	dataDir        string
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
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if sm.store != nil {
		sm.store.Clear()
		sm.store = nil
	}
	sm.unlocked = false
}

func (sm *SecretManager) IsUnlocked() bool {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.isUnlockedLocked()
}

// isUnlockedLocked is IsUnlocked for callers already holding mu (RWMutex
// read locks must not be taken recursively).
func (sm *SecretManager) isUnlockedLocked() bool {
	return sm.unlocked && sm.store != nil
}

func (sm *SecretManager) SetSecret(key, value string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if !sm.isUnlockedLocked() {
		return errSecretStoreLocked()
	}

	if key == "" {
		return errors.NewMissingRequiredFieldError("key")
	}

	encrypted, err := sm.store.Encrypt(value)
	if err != nil {
		return fmt.Errorf("failed to encrypt secret: %w", err)
	}

	return sm.settings.Update(sm.dataDir, func(st *config.Settings) error {
		if st.Secrets == nil {
			return errors.NewInvalidStateError("Secret store is not set up")
		}
		if st.Secrets.Store == nil {
			st.Secrets.Store = make(map[string]*crypto.EncryptedValue)
		}
		st.Secrets.Store[key] = encrypted
		return nil
	})
}

func (sm *SecretManager) GetSecret(key string) (string, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	if !sm.isUnlockedLocked() {
		return "", errSecretStoreLocked()
	}

	secretsConfig := sm.settings.GetSecretsConfig()
	if secretsConfig == nil || secretsConfig.Store == nil {
		return "", errors.NewNotFoundError("secret", key)
	}

	encrypted, exists := secretsConfig.Store[key]
	if !exists {
		return "", errors.NewNotFoundError("secret", key)
	}

	return sm.store.Decrypt(encrypted)
}

func (sm *SecretManager) ListSecrets() ([]string, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	if !sm.isUnlockedLocked() {
		return nil, errSecretStoreLocked()
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
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if !sm.isUnlockedLocked() {
		return errSecretStoreLocked()
	}

	return sm.settings.Update(sm.dataDir, func(st *config.Settings) error {
		if st.Secrets == nil || st.Secrets.Store == nil {
			return errors.NewNotFoundError("secret", key)
		}
		if _, exists := st.Secrets.Store[key]; !exists {
			return errors.NewNotFoundError("secret", key)
		}
		delete(st.Secrets.Store, key)
		return nil
	})
}

func (sm *SecretManager) GetGitHubToken() (string, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	if !sm.isUnlockedLocked() {
		return "", errSecretStoreLocked()
	}

	token := sm.settings.GetGitHubSettings().Token
	if token == nil {
		return "", nil
	}

	return sm.store.Decrypt(token)
}

func (sm *SecretManager) SetGitHubToken(token string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if !sm.isUnlockedLocked() {
		return errSecretStoreLocked()
	}

	encrypted, err := sm.store.Encrypt(token)
	if err != nil {
		return fmt.Errorf("failed to encrypt GitHub token: %w", err)
	}

	return sm.settings.Update(sm.dataDir, func(st *config.Settings) error {
		st.GitHub.Token = encrypted
		return nil
	})
}

func (sm *SecretManager) HasSecrets() bool {
	secretsConfig := sm.settings.GetSecretsConfig()
	return secretsConfig != nil && len(secretsConfig.Store) > 0
}

func (sm *SecretManager) UnlockWithPasskey(credentialID string) error {
	if sm.IsUnlocked() {
		return nil
	}

	// Initialize secrets config if it doesn't exist (similar to password unlock)
	if sm.settings.GetSecretsConfig() == nil {
		salt, err := crypto.GenerateSalt()
		if err != nil {
			return fmt.Errorf("failed to generate salt: %w", err)
		}

		secretsConfig := &config.SecretsConfig{
			Version:       1,
			KeyDerivation: "passkey", // Different from password-based ("scrypt")
			Salt:          base64.StdEncoding.EncodeToString(salt),
			Store:         make(map[string]*crypto.EncryptedValue),
		}

		// Re-check under the settings lock: a concurrent unlock may have
		// set it up first, and its config must not be replaced.
		if err := sm.settings.Update(sm.dataDir, func(st *config.Settings) error {
			if st.Secrets == nil {
				st.Secrets = secretsConfig
			}
			return nil
		}); err != nil {
			return fmt.Errorf("failed to save secrets config: %w", err)
		}
	}

	// Reads passkeys.json: done without holding mu.
	encryptionKey, err := sm.passkeyService.GetEncryptionKey(credentialID)
	if err != nil {
		if errors.HasCode(err, errors.ErrCodeNotFound) {
			return errors.NewUnauthorizedError("Unknown passkey").WithCause(err)
		}
		return fmt.Errorf("failed to get encryption key from passkey: %w", err)
	}

	salt := encryptionKey[:16]
	store, err := crypto.NewSecureStoreWithKey(encryptionKey, salt)
	if err != nil {
		return fmt.Errorf("failed to create secure store: %w", err)
	}

	sm.mu.Lock()
	defer sm.mu.Unlock()
	if sm.unlocked {
		// Another request unlocked while we derived the key.
		store.Clear()
		return nil
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

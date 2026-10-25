package services

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
)

type UserService struct {
	dataDir string
	mu      sync.Mutex
}

func NewUserService(dataDir string) *UserService {
	return &UserService{
		dataDir: dataDir,
	}
}

// getUsersFilePath returns the path to the users.json file
func (us *UserService) getUsersFilePath() string {
	return filepath.Join(us.dataDir, "users.json")
}

// loadUsers loads all users from the JSON file. Callers must hold us.mu.
func (us *UserService) loadUsers() (*models.UserStorage, error) {
	filePath := us.getUsersFilePath()

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return &models.UserStorage{Users: []models.User{}}, nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read users file: %w", err)
	}

	var storage models.UserStorage
	if err := json.Unmarshal(data, &storage); err != nil {
		return nil, fmt.Errorf("failed to unmarshal users data: %w", err)
	}

	return &storage, nil
}

// saveUsers saves all users to the JSON file atomically. Callers must hold us.mu.
func (us *UserService) saveUsers(storage *models.UserStorage) error {
	filePath := us.getUsersFilePath()

	// Ensure data directory exists
	if err := os.MkdirAll(us.dataDir, 0755); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}

	data, err := json.MarshalIndent(storage, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal users data: %w", err)
	}

	// Write to a temp file in the same directory, then rename over the target.
	// Rename is atomic on the same filesystem, so a crash mid-write can never
	// leave a partially-written users file behind.
	tmp, err := os.CreateTemp(us.dataDir, ".users-*.json.tmp")
	if err != nil {
		return fmt.Errorf("failed to create temp users file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op if the rename succeeded

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return fmt.Errorf("failed to write users file: %w", err)
	}
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return fmt.Errorf("failed to set users file permissions: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("failed to close temp users file: %w", err)
	}

	if err := os.Rename(tmpName, filePath); err != nil {
		return fmt.Errorf("failed to write users file: %w", err)
	}

	return nil
}

// IsFirstSetup checks if this is the first time the system is being set up
func (us *UserService) IsFirstSetup() (bool, error) {
	us.mu.Lock()
	defer us.mu.Unlock()

	storage, err := us.loadUsers()
	if err != nil {
		return false, err
	}
	return len(storage.Users) == 0, nil
}

// CreateFirstUser creates the first admin user during setup
func (us *UserService) CreateFirstUser(username, credentialId string) error {
	us.mu.Lock()
	defer us.mu.Unlock()

	storage, err := us.loadUsers()
	if err != nil {
		return err
	}

	// Check if users already exist
	if len(storage.Users) > 0 {
		return fmt.Errorf("users already exist, cannot create first user")
	}

	user := models.User{
		Username:   username,
		PasskeyIDs: []string{credentialId},
		IsAdmin:    true,
		CreatedAt:  time.Now(),
		LastLogin:  time.Now(),
	}

	storage.Users = append(storage.Users, user)
	return us.saveUsers(storage)
}

// GetUserByCredentialID finds a user by their passkey credential ID
func (us *UserService) GetUserByCredentialID(credentialId string) (*models.User, error) {
	us.mu.Lock()
	defer us.mu.Unlock()

	storage, err := us.loadUsers()
	if err != nil {
		return nil, err
	}

	for _, user := range storage.Users {
		for _, id := range user.PasskeyIDs {
			if id == credentialId {
				return &user, nil
			}
		}
	}

	return nil, fmt.Errorf("user not found for credential ID")
}

// GetUserByUsername finds a user by their username
func (us *UserService) GetUserByUsername(username string) (*models.User, error) {
	us.mu.Lock()
	defer us.mu.Unlock()

	storage, err := us.loadUsers()
	if err != nil {
		return nil, err
	}

	for _, user := range storage.Users {
		if user.Username == username {
			return &user, nil
		}
	}

	return nil, fmt.Errorf("user not found")
}

// UpdateLastLogin updates the user's last login time
func (us *UserService) UpdateLastLogin(username string) error {
	us.mu.Lock()
	defer us.mu.Unlock()

	storage, err := us.loadUsers()
	if err != nil {
		return err
	}

	for i, user := range storage.Users {
		if user.Username == username {
			storage.Users[i].LastLogin = time.Now()
			return us.saveUsers(storage)
		}
	}

	return fmt.Errorf("user not found")
}

// AddPasskeyToUser adds a new passkey credential to an existing user
func (us *UserService) AddPasskeyToUser(username, credentialId string) error {
	us.mu.Lock()
	defer us.mu.Unlock()

	storage, err := us.loadUsers()
	if err != nil {
		return err
	}

	for i, user := range storage.Users {
		if user.Username == username {
			storage.Users[i].PasskeyIDs = append(storage.Users[i].PasskeyIDs, credentialId)
			return us.saveUsers(storage)
		}
	}

	return fmt.Errorf("user not found")
}

// CreateUser creates a new user (admin only)
func (us *UserService) CreateUser(username string, isAdmin bool, credentialId string) error {
	us.mu.Lock()
	defer us.mu.Unlock()

	storage, err := us.loadUsers()
	if err != nil {
		return err
	}

	// Check if user already exists
	for _, user := range storage.Users {
		if user.Username == username {
			return fmt.Errorf("user already exists")
		}
	}

	user := models.User{
		Username:   username,
		PasskeyIDs: []string{credentialId},
		IsAdmin:    isAdmin,
		CreatedAt:  time.Now(),
		LastLogin:  time.Now(),
	}

	storage.Users = append(storage.Users, user)
	return us.saveUsers(storage)
}

// DeleteUser removes a user (admin only)
func (us *UserService) DeleteUser(username string) error {
	us.mu.Lock()
	defer us.mu.Unlock()

	storage, err := us.loadUsers()
	if err != nil {
		return err
	}

	for i, user := range storage.Users {
		if user.Username == username {
			storage.Users = append(storage.Users[:i], storage.Users[i+1:]...)
			return us.saveUsers(storage)
		}
	}

	return fmt.Errorf("user not found")
}

func (us *UserService) ListUsers() ([]models.User, error) {
	us.mu.Lock()
	defer us.mu.Unlock()

	storage, err := us.loadUsers()
	if err != nil {
		return nil, err
	}
	return storage.Users, nil
}

type Invite struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

func (us *UserService) GenerateInviteToken(createdBy string) (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate invite token: %w", err)
	}

	token := hex.EncodeToString(bytes)
	invite := Invite{
		Token:     token,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour), // 7 days
		CreatedBy: createdBy,
		CreatedAt: time.Now(),
	}

	us.mu.Lock()
	defer us.mu.Unlock()

	if err := us.saveInvite(invite); err != nil {
		return "", err
	}

	return token, nil
}

func (us *UserService) ValidateInviteToken(token string) (*Invite, error) {
	us.mu.Lock()
	defer us.mu.Unlock()

	return us.validateInviteToken(token)
}

// validateInviteToken loads and validates an invite, deleting it if expired.
// Callers must hold us.mu.
func (us *UserService) validateInviteToken(token string) (*Invite, error) {
	// The token names a file under invites/; only accept the exact form
	// GenerateInviteToken issues (32 random bytes, hex) so a crafted token such
	// as "../users" can never read or delete a file outside that directory.
	if !isWellFormedInviteToken(token) {
		return nil, fmt.Errorf("invalid invite token")
	}

	invite, err := us.loadInvite(token)
	if err != nil {
		return nil, fmt.Errorf("invalid invite token")
	}

	if time.Now().After(invite.ExpiresAt) {
		_ = us.deleteInvite(token)
		return nil, fmt.Errorf("invite token expired")
	}

	return invite, nil
}

func isWellFormedInviteToken(token string) bool {
	if len(token) != 64 {
		return false
	}
	for _, c := range token {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

func (us *UserService) ConsumeInviteToken(token string) error {
	us.mu.Lock()
	defer us.mu.Unlock()

	// Validate and delete under the same lock so a token can never be
	// consumed twice by concurrent requests.
	if _, err := us.validateInviteToken(token); err != nil {
		return err
	}

	return us.deleteInvite(token)
}

func (us *UserService) getInvitesDir() string {
	return filepath.Join(us.dataDir, "invites")
}

func (us *UserService) saveInvite(invite Invite) error {
	invitesDir := us.getInvitesDir()
	if err := os.MkdirAll(invitesDir, 0755); err != nil {
		return fmt.Errorf("failed to create invites directory: %w", err)
	}

	filePath := filepath.Join(invitesDir, invite.Token+".json")
	data, err := json.MarshalIndent(invite, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal invite: %w", err)
	}

	return os.WriteFile(filePath, data, 0600)
}

func (us *UserService) loadInvite(token string) (*Invite, error) {
	filePath := filepath.Join(us.getInvitesDir(), token+".json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	var invite Invite
	if err := json.Unmarshal(data, &invite); err != nil {
		return nil, err
	}

	return &invite, nil
}

// deleteInvite removes an invite file. Callers must hold us.mu.
func (us *UserService) deleteInvite(token string) error {
	filePath := filepath.Join(us.getInvitesDir(), token+".json")
	return os.Remove(filePath)
}

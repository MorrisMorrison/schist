package services

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
)

type UserService struct {
	dataDir string
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

// loadUsers loads all users from the JSON file
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

// saveUsers saves all users to the JSON file
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

	if err := os.WriteFile(filePath, data, 0600); err != nil {
		return fmt.Errorf("failed to write users file: %w", err)
	}

	return nil
}

// IsFirstSetup checks if this is the first time the system is being set up
func (us *UserService) IsFirstSetup() (bool, error) {
	storage, err := us.loadUsers()
	if err != nil {
		return false, err
	}
	return len(storage.Users) == 0, nil
}

// CreateFirstUser creates the first admin user during setup
func (us *UserService) CreateFirstUser(username, credentialId string) error {
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

	if err := us.saveInvite(invite); err != nil {
		return "", err
	}

	return token, nil
}

func (us *UserService) ValidateInviteToken(token string) (*Invite, error) {
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

func (us *UserService) ConsumeInviteToken(token string) error {
	_, err := us.ValidateInviteToken(token)
	if err != nil {
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

// deleteInvite removes an invite file
func (us *UserService) deleteInvite(token string) error {
	filePath := filepath.Join(us.getInvitesDir(), token+".json")
	return os.Remove(filePath)
}

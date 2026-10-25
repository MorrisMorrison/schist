package services

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/utils"
)

type UserService struct {
	dataDir string
	users   *jsonStore[models.UserStorage]
	// inviteMu guards the invite files under invites/.
	inviteMu sync.Mutex
}

func NewUserService(dataDir string) *UserService {
	return &UserService{
		dataDir: dataDir,
		users: &jsonStore[models.UserStorage]{
			path:  filepath.Join(dataDir, userStoreFile),
			perm:  0600,
			name:  "users file",
			empty: func() models.UserStorage { return models.UserStorage{Users: []models.User{}} },
		},
	}
}

var errUserNotFound = fmt.Errorf("user not found")

// userIndex returns the index of username in storage, or -1.
func userIndex(storage *models.UserStorage, username string) int {
	return slices.IndexFunc(storage.Users, func(u models.User) bool { return u.Username == username })
}

// updateUser applies fn to the stored user and saves the store.
func (us *UserService) updateUser(username string, fn func(*models.User)) error {
	return us.users.update(func(storage *models.UserStorage) error {
		i := userIndex(storage, username)
		if i < 0 {
			return errUserNotFound
		}
		fn(&storage.Users[i])
		return nil
	})
}

// addUser appends a new user, after check has accepted the current store.
func (us *UserService) addUser(username string, isAdmin bool, credentialId string, check func(*models.UserStorage) error) error {
	return us.users.update(func(storage *models.UserStorage) error {
		if err := check(storage); err != nil {
			return err
		}
		now := time.Now()
		storage.Users = append(storage.Users, models.User{
			Username:   username,
			PasskeyIDs: []string{credentialId},
			IsAdmin:    isAdmin,
			CreatedAt:  now,
			LastLogin:  now,
		})
		return nil
	})
}

// IsFirstSetup checks if this is the first time the system is being set up
func (us *UserService) IsFirstSetup() (bool, error) {
	storage, err := us.users.read()
	if err != nil {
		return false, err
	}
	return len(storage.Users) == 0, nil
}

// CreateFirstUser creates the first admin user during setup
func (us *UserService) CreateFirstUser(username, credentialId string) error {
	return us.addUser(username, true, credentialId, func(storage *models.UserStorage) error {
		if len(storage.Users) > 0 {
			return fmt.Errorf("users already exist, cannot create first user")
		}
		return nil
	})
}

// GetUserByCredentialID finds a user by their passkey credential ID
func (us *UserService) GetUserByCredentialID(credentialId string) (*models.User, error) {
	storage, err := us.users.read()
	if err != nil {
		return nil, err
	}

	for _, user := range storage.Users {
		if slices.Contains(user.PasskeyIDs, credentialId) {
			return &user, nil
		}
	}

	return nil, fmt.Errorf("user not found for credential ID")
}

// GetUserByUsername finds a user by their username
func (us *UserService) GetUserByUsername(username string) (*models.User, error) {
	storage, err := us.users.read()
	if err != nil {
		return nil, err
	}

	i := userIndex(&storage, username)
	if i < 0 {
		return nil, errUserNotFound
	}
	return &storage.Users[i], nil
}

// UpdateLastLogin updates the user's last login time
func (us *UserService) UpdateLastLogin(username string) error {
	return us.updateUser(username, func(u *models.User) { u.LastLogin = time.Now() })
}

// AddPasskeyToUser adds a new passkey credential to an existing user
func (us *UserService) AddPasskeyToUser(username, credentialId string) error {
	return us.updateUser(username, func(u *models.User) { u.PasskeyIDs = append(u.PasskeyIDs, credentialId) })
}

// CreateUser creates a new user (admin only)
func (us *UserService) CreateUser(username string, isAdmin bool, credentialId string) error {
	return us.addUser(username, isAdmin, credentialId, func(storage *models.UserStorage) error {
		if userIndex(storage, username) >= 0 {
			return fmt.Errorf("user already exists")
		}
		return nil
	})
}

// DeleteUser removes a user (admin only)
func (us *UserService) DeleteUser(username string) error {
	return us.users.update(func(storage *models.UserStorage) error {
		i := userIndex(storage, username)
		if i < 0 {
			return errUserNotFound
		}
		storage.Users = slices.Delete(storage.Users, i, i+1)
		return nil
	})
}

func (us *UserService) ListUsers() ([]models.User, error) {
	storage, err := us.users.read()
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

	us.inviteMu.Lock()
	defer us.inviteMu.Unlock()

	if err := us.saveInvite(invite); err != nil {
		return "", err
	}

	return token, nil
}

func (us *UserService) ValidateInviteToken(token string) (*Invite, error) {
	us.inviteMu.Lock()
	defer us.inviteMu.Unlock()

	return us.validateInviteToken(token)
}

// validateInviteToken loads and validates an invite, deleting it if expired.
// Callers must hold us.inviteMu.
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
	us.inviteMu.Lock()
	defer us.inviteMu.Unlock()

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

	return utils.WriteFileAtomic(filePath, data, 0600)
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

// deleteInvite removes an invite file. Callers must hold us.inviteMu.
func (us *UserService) deleteInvite(token string) error {
	filePath := filepath.Join(us.getInvitesDir(), token+".json")
	return os.Remove(filePath)
}

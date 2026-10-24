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

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/utils"
)

type ShareToken struct {
	ID           string    `json:"id"`
	DocumentPath string    `json:"document_path"`
	Token        string    `json:"token"`
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `json:"expires_at"`
	CreatedBy    string    `json:"created_by"`
}

type ShareService struct {
	config          *config.Config
	documentService *DocumentService
	shareFilePath   string
	mu              sync.Mutex
}

func NewShareService(config *config.Config, documentService *DocumentService) *ShareService {
	shareFilePath := filepath.Join(config.DataDir, ".schist", "shares.json")
	return &ShareService{
		config:          config,
		documentService: documentService,
		shareFilePath:   shareFilePath,
	}
}

func (s *ShareService) CreateShare(documentPath, createdBy string, expiryDays int) (*ShareToken, error) {
	// Verify document exists. GetDocumentByPath already returns typed API
	// errors (NotFound for a missing doc, InvalidPath for a bad path); propagate
	// those as-is so they map to the right status. This also avoids the
	// doubled-prefix bug where wrapping produced "document not found: document
	// not found". Any other failure is a genuine internal error.
	_, err := s.documentService.GetDocumentByPath(documentPath)
	if err != nil {
		if errors.IsAPIError(err) {
			return nil, err
		}
		return nil, fmt.Errorf("failed to verify document: %w", err)
	}

	// Generate secure token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}
	token := hex.EncodeToString(tokenBytes)

	// Generate ID
	idBytes := make([]byte, 16)
	if _, err := rand.Read(idBytes); err != nil {
		return nil, fmt.Errorf("failed to generate ID: %w", err)
	}
	id := hex.EncodeToString(idBytes)

	// Set default expiry if not provided and validate limits
	if expiryDays == 0 {
		expiryDays = s.config.ShareDefaultExpiryDays
	}

	// Validate expiry limits (0 means never expires)
	if expiryDays > 0 && expiryDays > s.config.ShareMaxExpiryDays {
		expiryDays = s.config.ShareMaxExpiryDays
	}

	// Calculate expiry
	var expiresAt time.Time
	if expiryDays <= 0 {
		// Never expires (set to far future)
		expiresAt = time.Now().AddDate(100, 0, 0)
	} else {
		expiresAt = time.Now().AddDate(0, 0, expiryDays)
	}

	shareToken := &ShareToken{
		ID:           id,
		DocumentPath: documentPath,
		Token:        token,
		CreatedAt:    time.Now(),
		ExpiresAt:    expiresAt,
		CreatedBy:    createdBy,
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.saveShare(shareToken); err != nil {
		return nil, fmt.Errorf("failed to save share: %w", err)
	}

	return shareToken, nil
}

func (s *ShareService) GetSharedDocument(token string) (*models.Document, error) {
	s.mu.Lock()
	shares, err := s.loadShares()
	s.mu.Unlock()
	if err != nil {
		return nil, fmt.Errorf("failed to load shares: %w", err)
	}

	var shareToken *ShareToken
	for _, share := range shares {
		if share.Token == token {
			shareToken = &share
			break
		}
	}

	if shareToken == nil {
		return nil, errors.NewNotFoundError("share", token)
	}

	// Treat an expired share as not-found so we don't reveal that the token
	// ever existed.
	if time.Now().After(shareToken.ExpiresAt) {
		return nil, errors.NewNotFoundError("share", token)
	}

	// Get the document. GetDocumentByPath returns typed API errors; propagate
	// those as-is, otherwise surface a genuine internal failure.
	document, err := s.documentService.GetDocumentByPath(shareToken.DocumentPath)
	if err != nil {
		if errors.IsAPIError(err) {
			return nil, err
		}
		return nil, fmt.Errorf("failed to load shared document: %w", err)
	}

	return document, nil
}

func (s *ShareService) ListShares(createdBy string) ([]ShareToken, error) {
	s.mu.Lock()
	shares, err := s.loadShares()
	s.mu.Unlock()
	if err != nil {
		return nil, fmt.Errorf("failed to load shares: %w", err)
	}

	var userShares []ShareToken
	now := time.Now()

	for _, share := range shares {
		if share.CreatedBy == createdBy && now.Before(share.ExpiresAt) {
			userShares = append(userShares, share)
		}
	}

	return userShares, nil
}

func (s *ShareService) RevokeShare(shareID, createdBy string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	shares, err := s.loadShares()
	if err != nil {
		return fmt.Errorf("failed to load shares: %w", err)
	}

	var updatedShares []ShareToken
	found := false

	for _, share := range shares {
		if share.ID == shareID && share.CreatedBy == createdBy {
			found = true
			// Skip this share (effectively deleting it)
			continue
		}
		updatedShares = append(updatedShares, share)
	}

	if !found {
		// Return NotFound (not Forbidden) so we don't leak whether the share
		// exists but is owned by someone else.
		return errors.NewNotFoundError("share", shareID)
	}

	return s.saveShares(updatedShares)
}

func (s *ShareService) CleanupExpiredShares() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	shares, err := s.loadShares()
	if err != nil {
		return fmt.Errorf("failed to load shares: %w", err)
	}

	var validShares []ShareToken
	now := time.Now()

	for _, share := range shares {
		if now.Before(share.ExpiresAt) {
			validShares = append(validShares, share)
		}
	}

	return s.saveShares(validShares)
}

// saveShare appends a share and persists the file. Callers must hold s.mu.
func (s *ShareService) saveShare(shareToken *ShareToken) error {
	shares, err := s.loadShares()
	if err != nil {
		return err
	}

	shares = append(shares, *shareToken)
	return s.saveShares(shares)
}

// loadShares reads the shares file. Callers must hold s.mu.
func (s *ShareService) loadShares() ([]ShareToken, error) {
	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(s.shareFilePath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create shares directory: %w", err)
	}

	// If file doesn't exist, return empty slice
	if _, err := os.Stat(s.shareFilePath); os.IsNotExist(err) {
		return []ShareToken{}, nil
	}

	data, err := os.ReadFile(s.shareFilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read shares file: %w", err)
	}

	var shares []ShareToken
	if len(data) == 0 {
		return shares, nil
	}

	if err := json.Unmarshal(data, &shares); err != nil {
		return nil, fmt.Errorf("failed to parse shares file: %w", err)
	}

	return shares, nil
}

// saveShares writes the shares file atomically. Callers must hold s.mu.
func (s *ShareService) saveShares(shares []ShareToken) error {
	data, err := json.MarshalIndent(shares, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal shares: %w", err)
	}

	// Atomic temp-file + rename, so a crash mid-write can never leave a
	// partially-written shares file behind.
	if err := utils.WriteFileAtomic(s.shareFilePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write shares file: %w", err)
	}

	return nil
}

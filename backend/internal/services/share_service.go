package services

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/models"
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
	// Verify document exists
	_, err := s.documentService.GetDocumentByPath(documentPath)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
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

	if err := s.saveShare(shareToken); err != nil {
		return nil, fmt.Errorf("failed to save share: %w", err)
	}

	return shareToken, nil
}

func (s *ShareService) GetSharedDocument(token string) (*models.Document, error) {
	shares, err := s.loadShares()
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
		return nil, fmt.Errorf("share not found")
	}

	// Check if token is expired
	if time.Now().After(shareToken.ExpiresAt) {
		return nil, fmt.Errorf("share has expired")
	}

	// Get the document
	document, err := s.documentService.GetDocumentByPath(shareToken.DocumentPath)
	if err != nil {
		return nil, fmt.Errorf("shared document not found: %w", err)
	}

	return document, nil
}

func (s *ShareService) ListShares(createdBy string) ([]ShareToken, error) {
	shares, err := s.loadShares()
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
		return fmt.Errorf("share not found or not owned by user")
	}

	return s.saveShares(updatedShares)
}

func (s *ShareService) CleanupExpiredShares() error {
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

func (s *ShareService) saveShare(shareToken *ShareToken) error {
	shares, err := s.loadShares()
	if err != nil {
		return err
	}

	shares = append(shares, *shareToken)
	return s.saveShares(shares)
}

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

func (s *ShareService) saveShares(shares []ShareToken) error {
	data, err := json.MarshalIndent(shares, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal shares: %w", err)
	}

	if err := os.WriteFile(s.shareFilePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write shares file: %w", err)
	}

	return nil
}

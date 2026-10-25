package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"time"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/errors"
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
	shares          *jsonStore[[]ShareToken]
}

func NewShareService(config *config.Config, documentService *DocumentService) *ShareService {
	return &ShareService{
		config:          config,
		documentService: documentService,
		shares: &jsonStore[[]ShareToken]{
			path:        filepath.Join(config.DataDir, appStateDir, "shares.json"),
			perm:        0644,
			name:        "shares file",
			empty:       func() []ShareToken { return []ShareToken{} },
			emptyFileOK: true,
		},
	}
}

func (s *ShareService) CreateShare(documentPath, createdBy string, expiryDays int) (*ShareToken, error) {
	if !s.config.SharingEnabled {
		return nil, errors.NewForbiddenError("Document sharing is disabled")
	}

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

	err = s.shares.update(func(shares *[]ShareToken) error {
		*shares = append(*shares, *shareToken)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to save share: %w", err)
	}

	return shareToken, nil
}

func (s *ShareService) GetSharedDocument(token string) (*models.Document, error) {
	// With sharing disabled every token is treated as unknown, so the public
	// endpoint reveals nothing about previously created shares.
	if !s.config.SharingEnabled {
		return nil, errors.NewNotFoundError("share", token)
	}

	shares, err := s.shares.read()
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
	shares, err := s.shares.read()
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
	return s.shares.update(func(shares *[]ShareToken) error {
		var updatedShares []ShareToken
		found := false

		for _, share := range *shares {
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
		*shares = updatedShares
		return nil
	})
}

func (s *ShareService) CleanupExpiredShares() error {
	return s.shares.update(func(shares *[]ShareToken) error {
		var validShares []ShareToken
		now := time.Now()

		for _, share := range *shares {
			if now.Before(share.ExpiresAt) {
				validShares = append(validShares, share)
			}
		}
		*shares = validShares
		return nil
	})
}

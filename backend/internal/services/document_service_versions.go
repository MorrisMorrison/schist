package services

import (
	"errors"
	"fmt"
	"log"

	"github.com/MorrisMorrison/schist/internal/models"
)

// Git-backed version history operations for documents. Split out of
// document_service.go to keep that file focused on document/folder CRUD.

func (d *DocumentService) GetDocumentVersions(documentPath string) ([]*DocumentVersion, error) {
	if d.gitService == nil {
		return nil, fmt.Errorf("git service not available")
	}

	return d.gitService.GetDocumentVersions(documentPath)
}

func (d *DocumentService) GetDocumentAtVersion(documentPath string, commitHash string) (*models.Document, error) {
	if d.gitService == nil {
		return nil, fmt.Errorf("git service not available")
	}

	return d.gitService.GetDocumentAtVersion(documentPath, commitHash)
}

// ErrCommitFailed wraps a git-commit failure that occurred after the document
// was already written to disk. The on-disk write succeeded, but version history
// was not recorded, so callers/the API layer can surface a "saved but not
// versioned" warning rather than reporting a clean success.
var ErrCommitFailed = errors.New("document saved but version commit failed")

// commitDocumentChange records a version-control commit for a document change.
// It returns an error wrapping ErrCommitFailed if the commit fails so callers
// can distinguish a successful disk write with lost history from a clean
// success. When no git service is configured, versioning is disabled and nil is
// returned.
func (d *DocumentService) commitDocumentChange(documentPath string, message string) error {
	if d.gitService == nil {
		return nil
	}

	if err := d.gitService.CommitDocument(documentPath, message); err != nil {
		log.Printf("Warning: Failed to commit document change for %s: %v", documentPath, err)
		return fmt.Errorf("%w for %s: %v", ErrCommitFailed, documentPath, err)
	}

	return nil
}

func (d *DocumentService) CompareDocumentVersions(documentPath, hash1, hash2 string) (*DiffResult, error) {
	if d.gitService == nil {
		return nil, fmt.Errorf("git service not available")
	}

	return d.gitService.CompareVersions(documentPath, hash1, hash2)
}

func (d *DocumentService) RestoreDocumentToVersion(path, commitHash string) error {
	if d.gitService == nil {
		return fmt.Errorf("git service not available")
	}

	if err := d.gitService.RestoreDocument(path, commitHash); err != nil {
		return fmt.Errorf("failed to restore document: %w", err)
	}

	return nil
}

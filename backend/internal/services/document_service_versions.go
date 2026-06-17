package services

import (
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

func (d *DocumentService) commitDocumentChange(documentPath string, message string) {
	if d.gitService == nil {
		return
	}

	if err := d.gitService.CommitDocument(documentPath, message); err != nil {
		log.Printf("Warning: Failed to commit document change for %s: %v", documentPath, err)
	}
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

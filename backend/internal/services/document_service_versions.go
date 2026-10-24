package services

import (
	stderrors "errors"
	"fmt"
	"log"
	"regexp"

	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/utils"
)

// Git-backed version history operations for documents. Split out of
// document_service.go to keep that file focused on document/folder CRUD.
//
// These methods translate the low-level git errors surfaced by gitService into
// the shared error taxonomy (internal/errors) so the handler layer can map them
// to the right HTTP status:
//   - a missing document/path or an unknown commit hash -> NotFound (404)
//   - a malformed/empty commit hash -> Validation (400)
//   - a path that breaks the shared path rules -> InvalidPath (400)
//   - genuine git/IO failures -> plain error (500)

// fullCommitHashPattern matches a 40-character lowercase SHA-1 commit hash, the
// form go-git emits and the only form these endpoints accept. Anything else is
// treated as malformed client input rather than a missing version.
var fullCommitHashPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)

// validateCommitHash rejects empty or malformed commit hashes with a typed
// validation error (400). A well-formed hash that simply does not exist in the
// repository is not caught here; that surfaces as a NotFound from git below.
func validateCommitHash(field, commitHash string) *errors.APIError {
	if commitHash == "" {
		return errors.NewMissingRequiredFieldError(field)
	}
	if !fullCommitHashPattern.MatchString(commitHash) {
		return errors.NewValidationError(
			fmt.Sprintf("invalid commit hash for %s: must be a 40-character hex SHA-1", field),
		).WithDetails(field, commitHash)
	}
	return nil
}

// versionNotFound reports whether err comes from a version lookup that found
// no such commit (or no such document in that commit), and returns the hash
// that could not be resolved.
func versionNotFound(err error) (string, bool) {
	var notFound *VersionNotFoundError
	if stderrors.As(err, &notFound) {
		return notFound.Hash, true
	}
	return "", false
}

// validateDocumentPath applies the shared path rules to a version-endpoint
// path so a crafted path can never reach the git tree lookup or the restore
// write outside the data directory.
func validateDocumentPath(documentPath string) error {
	if err := utils.ValidatePath(documentPath); err != nil {
		return errors.NewInvalidPathError(documentPath).WithCause(err)
	}
	return nil
}

func (d *DocumentService) GetDocumentVersions(documentPath string) ([]*DocumentVersion, error) {
	if err := validateDocumentPath(documentPath); err != nil {
		return nil, err
	}
	if d.gitService == nil {
		return nil, fmt.Errorf("git service not available")
	}

	versions, err := d.gitService.GetDocumentVersions(documentPath)
	if err != nil {
		return nil, fmt.Errorf("failed to get document versions: %w", err)
	}

	// gitService returns an empty slice when the document has no tracked history.
	// That is ambiguous: the document may genuinely not exist (-> 404), or it may
	// exist with no versions yet (a fresh document, or one saved while the git
	// commit failed -- see ErrCommitFailed). Only the missing-document case is a
	// 404; an existing document with no versions is a valid empty list (200), so
	// the version panel can show a "no versions yet" state.
	if len(versions) == 0 {
		if _, err := d.GetDocumentByPath(documentPath); err != nil {
			return nil, err // typed NotFound("document", ...) when the document is absent
		}
		return []*DocumentVersion{}, nil
	}

	return versions, nil
}

func (d *DocumentService) GetDocumentAtVersion(documentPath string, commitHash string) (*models.Document, error) {
	if err := validateDocumentPath(documentPath); err != nil {
		return nil, err
	}
	if d.gitService == nil {
		return nil, fmt.Errorf("git service not available")
	}

	if apiErr := validateCommitHash("hash", commitHash); apiErr != nil {
		return nil, apiErr
	}

	document, err := d.gitService.GetDocumentAtVersion(documentPath, commitHash)
	if err != nil {
		if hash, ok := versionNotFound(err); ok {
			return nil, errors.NewNotFoundError("version", hash).WithCause(err)
		}
		return nil, fmt.Errorf("failed to get document at version: %w", err)
	}

	return document, nil
}

// ErrCommitFailed wraps a git-commit failure that occurred after the document
// was already written to disk. The on-disk write succeeded, but version history
// was not recorded, so callers/the API layer can surface a "saved but not
// versioned" warning rather than reporting a clean success.
var ErrCommitFailed = stderrors.New("document saved but version commit failed")

// commitDocumentChange records a version-control commit for a document change.
// It returns an error wrapping ErrCommitFailed if the commit fails so callers
// can distinguish a successful disk write with lost history from a clean
// success. When no git service is configured, versioning is disabled and nil is
// returned.
func (d *DocumentService) commitDocumentChange(message string, documentPaths ...string) error {
	if d.gitService == nil {
		return nil
	}

	if err := d.gitService.CommitDocuments(message, documentPaths...); err != nil {
		log.Printf("Warning: Failed to commit document change for %v: %v", documentPaths, err)
		return fmt.Errorf("%w for %v: %v", ErrCommitFailed, documentPaths, err)
	}

	return nil
}

func (d *DocumentService) CompareDocumentVersions(documentPath, hash1, hash2 string) (*DiffResult, error) {
	if err := validateDocumentPath(documentPath); err != nil {
		return nil, err
	}
	if d.gitService == nil {
		return nil, fmt.Errorf("git service not available")
	}

	if apiErr := validateCommitHash("hash1", hash1); apiErr != nil {
		return nil, apiErr
	}
	if apiErr := validateCommitHash("hash2", hash2); apiErr != nil {
		return nil, apiErr
	}

	diff, err := d.gitService.CompareVersions(documentPath, hash1, hash2)
	if err != nil {
		if missing, ok := versionNotFound(err); ok {
			return nil, errors.NewNotFoundError("version", missing).WithCause(err)
		}
		return nil, fmt.Errorf("failed to compare document versions: %w", err)
	}

	return diff, nil
}

func (d *DocumentService) RestoreDocumentToVersion(path, commitHash string) error {
	if err := validateDocumentPath(path); err != nil {
		return err
	}
	if d.gitService == nil {
		return fmt.Errorf("git service not available")
	}

	if apiErr := validateCommitHash("hash", commitHash); apiErr != nil {
		return apiErr
	}

	if err := d.gitService.RestoreDocument(path, commitHash); err != nil {
		if hash, ok := versionNotFound(err); ok {
			return errors.NewNotFoundError("version", hash).WithCause(err)
		}
		return fmt.Errorf("failed to restore document: %w", err)
	}

	return nil
}

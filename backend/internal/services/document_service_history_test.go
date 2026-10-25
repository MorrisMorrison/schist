package services_test

import (
	stderrors "errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
)

func saveManual(t *testing.T, ds *services.DocumentService, path, title, content string) {
	t.Helper()
	require.NoError(t, ds.UpdateDocumentWithSaveType(&models.Document{
		MetaData: &models.DocumentMetaData{Title: title, Path: path},
		Content:  content,
	}, "manual"))
}

func TestDocumentService_VersionHistoryAndRestore(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	mustCreate(t, ds, "/journal", "Journal", "first draft")
	saveManual(t, ds, "/journal", "Journal", "second draft")

	versions, err := ds.GetDocumentVersions("/journal")
	require.NoError(t, err)
	require.Len(t, versions, 2)
	newest, oldest := versions[0], versions[1]
	assert.Contains(t, oldest.Message, "Create document: /journal")
	assert.Contains(t, newest.Message, "Update document: /journal")
	assert.Equal(t, "/journal", newest.FilePath)

	old, err := ds.GetDocumentAtVersion("/journal", oldest.Hash)
	require.NoError(t, err)
	assert.Equal(t, "first draft", strings.TrimSpace(old.Content))

	diff, err := ds.CompareDocumentVersions("/journal", oldest.Hash, newest.Hash)
	require.NoError(t, err)
	assert.Equal(t, oldest.Hash, diff.Hash1)
	assert.Positive(t, diff.Summary.Additions+diff.Summary.Deletions)

	require.NoError(t, ds.RestoreDocumentToVersion("/journal", oldest.Hash))
	current, err := ds.GetDocumentByPath("/journal")
	require.NoError(t, err)
	assert.Equal(t, "first draft", strings.TrimSpace(current.Content))

	versions, err = ds.GetDocumentVersions("/journal")
	require.NoError(t, err)
	require.Len(t, versions, 3, "a restore is a new version; history is never rewritten")
	assert.True(t, strings.HasPrefix(versions[0].Message, "Restore document to version "+oldest.Hash[:7]), versions[0].Message)

	t.Run("restore recreates a deleted note", func(t *testing.T) {
		require.NoError(t, ds.DeleteDocument("/journal"))
		require.NoError(t, ds.RestoreDocumentToVersion("/journal", newest.Hash))
		restored, err := os.ReadFile(filepath.Join(dir, "journal.md"))
		require.NoError(t, err)
		assert.Contains(t, string(restored), "second draft")
	})
}

func TestDocumentService_AutoSaveDoesNotCreateVersions(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	mustCreate(t, ds, "/doc", "Doc", "v1")
	require.NoError(t, ds.UpdateDocumentWithSaveType(&models.Document{
		MetaData: &models.DocumentMetaData{Title: "Doc", Path: "/doc"}, Content: "v2",
	}, "auto"))

	versions, err := ds.GetDocumentVersions("/doc")
	require.NoError(t, err)
	assert.Len(t, versions, 1)
	doc, err := ds.GetDocumentByPath("/doc")
	require.NoError(t, err)
	assert.Equal(t, "v2", strings.TrimSpace(doc.Content), "auto-save still writes the note")
}

func TestDocumentService_GetDocumentVersionsWithoutHistory(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)

	_, err := ds.GetDocumentVersions("/missing")
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))

	// A note on disk that was never committed has an empty history, not a 404.
	require.NoError(t, os.WriteFile(filepath.Join(dir, "untracked.md"),
		[]byte("---\ntitle: Untracked\npath: /untracked\n---\nbody\n"), 0644))
	versions, err := ds.GetDocumentVersions("/untracked")
	require.NoError(t, err)
	assert.Empty(t, versions)
	assert.NotNil(t, versions)
}

func TestDocumentService_VersionHashValidation(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	mustCreate(t, ds, "/doc", "Doc", "x")
	versions, err := ds.GetDocumentVersions("/doc")
	require.NoError(t, err)
	good := versions[0].Hash

	tests := []struct {
		name string
		hash string
		code apierrors.ErrorCode
	}{
		{"empty", "", apierrors.ErrCodeMissingRequired},
		{"short", "abc123", apierrors.ErrCodeValidation},
		{"uppercase", strings.ToUpper(good), apierrors.ErrCodeValidation},
		{"not hex", strings.Repeat("z", 40), apierrors.ErrCodeValidation},
		{"path-like", "../../../../etc/passwd/0000000000000000000", apierrors.ErrCodeValidation},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ds.GetDocumentAtVersion("/doc", tt.hash)
			assert.Equal(t, tt.code, apiErrorCode(err))
			_, err = ds.CompareDocumentVersions("/doc", tt.hash, good)
			assert.Equal(t, tt.code, apiErrorCode(err))
			_, err = ds.CompareDocumentVersions("/doc", good, tt.hash)
			assert.Equal(t, tt.code, apiErrorCode(err))
			assert.Equal(t, tt.code, apiErrorCode(ds.RestoreDocumentToVersion("/doc", tt.hash)))
		})
	}
}

func TestDocumentService_WithoutGitService(t *testing.T) {
	dir := t.TempDir()
	ds := services.NewDocumentService(dir, nil, services.NewIgnoreService(dir))
	const hash = "0123456789abcdef0123456789abcdef01234567"

	// Versioning is off, but notes still work.
	mustCreate(t, ds, "/doc", "Doc", "x")
	saveManual(t, ds, "/doc", "Doc", "y")
	require.NoError(t, ds.MoveDocument("/doc", "/moved"))
	require.NoError(t, ds.DeleteDocument("/moved"))

	_, err := ds.GetDocumentVersions("/doc")
	assert.ErrorContains(t, err, "git service not available")
	_, err = ds.GetDocumentAtVersion("/doc", hash)
	assert.ErrorContains(t, err, "git service not available")
	_, err = ds.CompareDocumentVersions("/doc", hash, hash)
	assert.ErrorContains(t, err, "git service not available")
	assert.ErrorContains(t, ds.RestoreDocumentToVersion("/doc", hash), "git service not available")
}

func TestDocumentService_CommitFailureKeepsTheSavedNote(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	// A corrupt index makes every commit fail.
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".git", "index"), []byte("garbage"), 0644))

	err := ds.CreateDocument(&models.Document{
		MetaData: &models.DocumentMetaData{Title: "Note", Path: "/note"},
		Content:  "keep me",
	})
	require.Error(t, err)
	assert.True(t, stderrors.Is(err, services.ErrCommitFailed), "err: %v", err)
	assert.False(t, apierrors.IsAPIError(err), "a commit failure is an internal error")

	doc, err := ds.GetDocumentByPath("/note")
	require.NoError(t, err, "the note must be on disk even though versioning failed")
	assert.Equal(t, "keep me", strings.TrimSpace(doc.Content))
}

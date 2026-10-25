package services_test

import (
	"bytes"
	stderrors "errors"
	"mime/multipart"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
)

// Tests for the document/folder paths that can lose or hide user notes.

func newSafetyDocumentService(t *testing.T) (*services.DocumentService, string) {
	t.Helper()
	dir := t.TempDir()
	return setupDocumentService(t, dir), dir
}

func mustCreate(t *testing.T, ds *services.DocumentService, path, title, content string) {
	t.Helper()
	require.NoError(t, ds.CreateDocument(&models.Document{
		MetaData: &models.DocumentMetaData{Title: title, Path: path},
		Content:  content,
	}))
}

func apiErrorCode(err error) apierrors.ErrorCode {
	var apiErr *apierrors.APIError
	if stderrors.As(err, &apiErr) {
		return apiErr.Code
	}
	return ""
}

func TestDocumentService_UpdatePreservesCreated(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	mustCreate(t, ds, "/projects/a", "A", "v1")

	original, err := ds.GetDocumentByPath("/projects/a")
	require.NoError(t, err)
	require.False(t, original.MetaData.Created.IsZero())

	tests := []struct {
		name    string
		created time.Time
	}{
		{name: "client omits created", created: time.Time{}},
		{name: "client sends a different created", created: time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Mirrors PUT /api/documents/projects/a with only title/path/tags.
			update := &models.Document{
				MetaData: &models.DocumentMetaData{
					Title:   "A",
					Path:    "/projects/a",
					Tags:    []string{"x"},
					Created: tt.created,
				},
				Content: "v2",
			}
			require.NoError(t, ds.UpdateDocumentWithSaveType(update, "manual"))

			got, err := ds.GetDocumentByPath("/projects/a")
			require.NoError(t, err)
			assert.True(t, got.MetaData.Created.Equal(original.MetaData.Created),
				"created = %v, want %v", got.MetaData.Created, original.MetaData.Created)
			assert.False(t, got.MetaData.Updated.Before(original.MetaData.Updated))
			assert.Equal(t, "v2", got.Content)
		})
	}

	t.Run("update of a not-yet-existing document stamps created", func(t *testing.T) {
		doc := &models.Document{
			MetaData: &models.DocumentMetaData{Title: "New", Path: "/fresh"},
			Content:  "c",
		}
		require.NoError(t, ds.UpdateDocumentWithSaveType(doc, "auto"))
		got, err := ds.GetDocumentByPath("/fresh")
		require.NoError(t, err)
		assert.False(t, got.MetaData.Created.IsZero())
	})
}

func TestDocumentService_CreateDocumentRefusesOverwrite(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	mustCreate(t, ds, "/note", "Note", "original")

	err := ds.CreateDocument(&models.Document{
		MetaData: &models.DocumentMetaData{Title: "Note", Path: "/note"},
		Content:  "clobber",
	})
	require.Error(t, err)
	assert.Equal(t, apierrors.ErrCodeAlreadyExists, apiErrorCode(err))

	got, err := ds.GetDocumentByPath("/note")
	require.NoError(t, err)
	assert.Equal(t, "original", got.Content)
}

func TestDocumentService_MoveDocumentRefusesOverwrite(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	mustCreate(t, ds, "/a", "A", "content a")
	mustCreate(t, ds, "/b", "B", "content b")

	err := ds.MoveDocument("/a", "/b")
	require.Error(t, err)
	assert.Equal(t, apierrors.ErrCodeAlreadyExists, apiErrorCode(err))

	a, err := ds.GetDocumentByPath("/a")
	require.NoError(t, err)
	assert.Equal(t, "content a", a.Content)
	b, err := ds.GetDocumentByPath("/b")
	require.NoError(t, err)
	assert.Equal(t, "content b", b.Content)
}

func TestDocumentService_MoveDocumentCommitsOldPathRemoval(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	mustCreate(t, ds, "/old", "Old", "x")

	require.NoError(t, ds.MoveDocument("/old", "/new"))

	repo, err := git.PlainOpen(dir)
	require.NoError(t, err)
	wt, err := repo.Worktree()
	require.NoError(t, err)
	status, err := wt.Status()
	require.NoError(t, err)
	assert.True(t, status.IsClean(), "move must commit both the new file and the old file's removal, status:\n%s", status)
}

func TestDocumentService_DeleteDocumentPathForms(t *testing.T) {
	tests := []struct {
		name string
		arg  string
	}{
		{name: "logical path", arg: "/doc"},
		{name: "without leading slash", arg: "doc"},
		{name: "with .md suffix", arg: "/doc.md"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ds, dir := newSafetyDocumentService(t)
			mustCreate(t, ds, "/doc", "Doc", "x")

			require.NoError(t, ds.DeleteDocument(tt.arg))
			_, err := os.Stat(filepath.Join(dir, "doc.md"))
			assert.True(t, os.IsNotExist(err))
		})
	}
}

func TestDocumentService_RenameFolderRejectsInvalidNames(t *testing.T) {
	tests := []struct {
		name    string
		newName string
	}{
		{name: "dot-dot", newName: ".."},
		{name: "dot", newName: "."},
		{name: "space", newName: "My Notes"},
		{name: "backslash", newName: `..\escape`},
		{name: "slash", newName: "a/b"},
		{name: "empty", newName: ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ds, dir := newSafetyDocumentService(t)
			require.NoError(t, ds.CreateFolder("/docs"))
			mustCreate(t, ds, "/docs/page", "Page", "keep me")

			err := ds.RenameFolder("/docs", tt.newName)
			require.Error(t, err)
			code := apiErrorCode(err)
			assert.Contains(t, []apierrors.ErrorCode{apierrors.ErrCodeValidation, apierrors.ErrCodeInvalidPath}, code)

			_, statErr := os.Stat(filepath.Join(dir, "docs", "page.md"))
			assert.NoError(t, statErr, "document must stay where it was")
		})
	}
}

func TestDocumentService_RenameFolderTrailingSlash(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	require.NoError(t, ds.CreateFolder("/docs"))
	mustCreate(t, ds, "/docs/page", "Page", "x")

	require.NoError(t, ds.RenameFolder("/docs/", "notes"))

	got, err := ds.GetDocumentByPath("/notes/page")
	require.NoError(t, err)
	assert.Equal(t, "/notes/page", got.MetaData.Path)
	_, err = os.Stat(filepath.Join(dir, "docs"))
	assert.True(t, os.IsNotExist(err))
}

func multipartFiles(t *testing.T, files map[string]string) []*multipart.FileHeader {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for name, content := range files {
		fw, err := w.CreateFormFile("files", name)
		require.NoError(t, err)
		_, err = fw.Write([]byte(content))
		require.NoError(t, err)
	}
	require.NoError(t, w.Close())

	form, err := multipart.NewReader(&buf, w.Boundary()).ReadForm(1 << 20)
	require.NoError(t, err)
	t.Cleanup(func() { _ = form.RemoveAll() })
	return form.File["files"]
}

func TestDocumentService_ImportDoesNotOverwriteUnreadableNote(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	// A note whose front matter cannot be parsed still belongs to the user.
	corrupt := []byte("not front matter at all\n")
	require.NoError(t, os.WriteFile(filepath.Join(dir, "my-note.md"), corrupt, 0644))

	result, err := ds.ImportDocuments(
		multipartFiles(t, map[string]string{"my-note.md": "# My Note\n\nimported"}),
		&models.ImportOptions{TargetPath: "/", OverwriteMode: "rename"},
	)
	require.NoError(t, err)
	require.Len(t, result.Success, 1)
	assert.NotEqual(t, "/my-note", result.Success[0].FinalPath)

	got, err := os.ReadFile(filepath.Join(dir, "my-note.md"))
	require.NoError(t, err)
	assert.Equal(t, corrupt, got, "existing file must not be overwritten")
}

func TestDocumentService_ImportModes(t *testing.T) {
	tests := []struct {
		mode        string
		wantPath    string
		wantSkipped bool
		wantContent string
	}{
		{mode: "rename", wantPath: "/my-note-1", wantContent: "original"},
		{mode: "skip", wantPath: "/my-note", wantSkipped: true, wantContent: "original"},
		{mode: "overwrite", wantPath: "/my-note", wantContent: "# My Note\n\nimported"},
	}
	for _, tt := range tests {
		t.Run(tt.mode, func(t *testing.T) {
			ds, _ := newSafetyDocumentService(t)
			mustCreate(t, ds, "/my-note", "My Note", "original")

			result, err := ds.ImportDocuments(
				multipartFiles(t, map[string]string{"x.md": "# My Note\n\nimported"}),
				&models.ImportOptions{TargetPath: "/", OverwriteMode: tt.mode},
			)
			require.NoError(t, err)
			require.Empty(t, result.Failed)
			if tt.wantSkipped {
				require.Len(t, result.Skipped, 1)
				assert.Equal(t, tt.wantPath, result.Skipped[0].FinalPath)
			} else {
				require.Len(t, result.Success, 1)
				assert.Equal(t, tt.wantPath, result.Success[0].FinalPath)
			}

			got, err := ds.GetDocumentByPath("/my-note")
			require.NoError(t, err)
			assert.Equal(t, tt.wantContent, got.Content)
		})
	}
}

func TestDocumentService_ImportFailureMessagesDoNotLeakInternals(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)

	result, err := ds.ImportDocuments(
		multipartFiles(t, map[string]string{"notes.txt": "hello"}),
		&models.ImportOptions{TargetPath: "/"},
	)
	require.NoError(t, err)
	require.Len(t, result.Failed, 1)
	assert.Equal(t, "only markdown files (.md) are supported", result.Failed[0].Error)
	assert.NotContains(t, result.Failed[0].Error, dir)
}

func TestDocumentService_ImportStripsFrontMatter(t *testing.T) {
	tests := []struct {
		name        string
		file        string
		wantContent string
	}{
		{
			name:        "multi-line front matter (Obsidian)",
			file:        "---\ntitle: Imported\ntags:\n  - a\n---\n# Imported\n\nbody",
			wantContent: "# Imported\n\nbody",
		},
		{
			name:        "single-line front matter",
			file:        "---\ntitle: Imported\n---\n# Imported\n\nbody",
			wantContent: "# Imported\n\nbody",
		},
		{
			name:        "no front matter",
			file:        "# Imported\n\nbody\n---\nafter rule",
			wantContent: "# Imported\n\nbody\n---\nafter rule",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ds, _ := newSafetyDocumentService(t)
			result, err := ds.ImportDocuments(
				multipartFiles(t, map[string]string{"imported.md": tt.file}),
				&models.ImportOptions{TargetPath: "/"},
			)
			require.NoError(t, err)
			require.Len(t, result.Success, 1, "%+v", result.Failed)

			got, err := ds.GetDocumentByPath(result.Success[0].FinalPath)
			require.NoError(t, err)
			assert.Equal(t, tt.wantContent, got.Content)
		})
	}
}

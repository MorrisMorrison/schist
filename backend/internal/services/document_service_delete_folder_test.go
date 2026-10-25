package services_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
)

func TestDocumentService_DeleteFolder(t *testing.T) {
	t.Run("removes the folder and every note in it", func(t *testing.T) {
		ds, dir := newSafetyDocumentService(t)
		mustCreate(t, ds, "/projects/a", "A", "a")
		mustCreate(t, ds, "/projects/sub/b", "B", "b")
		mustCreate(t, ds, "/keep", "Keep", "keep")

		require.NoError(t, ds.DeleteFolder("/projects"))

		_, err := os.Stat(filepath.Join(dir, "projects"))
		assert.True(t, os.IsNotExist(err), "folder should be gone")
		_, err = ds.GetDocumentByPath("/keep")
		assert.NoError(t, err, "notes outside the folder must survive")
	})

	tests := []struct {
		name string
		path string
		code apierrors.ErrorCode
	}{
		{"empty path", "", apierrors.ErrCodeInvalidPath},
		{"relative path", "projects", apierrors.ErrCodeInvalidPath},
		{"parent traversal", "/../outside", apierrors.ErrCodeInvalidPath},
		{"dot segment", "/projects/./x", apierrors.ErrCodeInvalidPath},
		{"hidden git dir", "/.git", apierrors.ErrCodeInvalidPath},
		{"app state dir", "/.schist", apierrors.ErrCodeInvalidPath},
		{"root", "/", apierrors.ErrCodeValidation},
		// "//" and friends normalise to the data dir itself: deleting it would
		// wipe every note and the git history.
		{"double slash root", "//", apierrors.ErrCodeValidation},
		{"triple slash root", "///", apierrors.ErrCodeValidation},
		{"missing folder", "/does-not-exist", apierrors.ErrCodeNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ds, dir := newSafetyDocumentService(t)
			mustCreate(t, ds, "/note", "Note", "precious")

			err := ds.DeleteFolder(tt.path)
			require.Error(t, err)
			assert.Equal(t, tt.code, apiErrorCode(err), "err: %v", err)

			_, statErr := os.Stat(filepath.Join(dir, "note.md"))
			assert.NoError(t, statErr, "a rejected delete must not touch existing notes")
			_, statErr = os.Stat(filepath.Join(dir, ".git"))
			assert.NoError(t, statErr, "a rejected delete must not touch the git repository")
		})
	}
}

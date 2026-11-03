package services_test

import (
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/services"
)

// The commit hook is how GitHub's sync on save learns about writes: it must
// fire for every document write (create, update, move, delete) and never for
// the sync's own commit of pending changes, which would make syncs loop.
func TestGitService_CommitHook(t *testing.T) {
	dataDir := t.TempDir()
	gitService, err := services.NewGitService(dataDir)
	require.NoError(t, err)
	var commits atomic.Int32
	gitService.SetCommitHook(func() { commits.Add(1) })
	ds := services.NewDocumentService(dataDir, gitService, services.NewIgnoreService(dataDir))

	doc := createTestDocument("/notes/hook", "Hook", "# Hook\n")
	require.NoError(t, ds.CreateDocument(doc))
	assert.Equal(t, int32(1), commits.Load(), "create")

	doc.Content = "# Hook\n\nMore.\n"
	require.NoError(t, ds.UpdateDocumentWithSaveType(doc, "manual"))
	assert.Equal(t, int32(2), commits.Load(), "update")

	require.NoError(t, ds.MoveDocument("/notes/hook", "/notes/moved"))
	assert.Equal(t, int32(3), commits.Load(), "move")

	require.NoError(t, ds.DeleteDocument("/notes/moved"))
	assert.Equal(t, int32(4), commits.Load(), "delete")

	require.NoError(t, os.WriteFile(filepath.Join(dataDir, "loose.md"), []byte("# Loose\n"), 0644))
	committed, err := gitService.CommitPendingChanges("Sync: commit changes before GitHub sync")
	require.NoError(t, err)
	require.True(t, committed)
	assert.Equal(t, int32(4), commits.Load(), "the sync's own commit doesn't notify")

	assert.Error(t, gitService.CommitDocuments("nothing"))
	assert.Equal(t, int32(4), commits.Load(), "a failed commit doesn't notify")
}

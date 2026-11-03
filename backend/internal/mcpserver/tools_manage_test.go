package mcpserver

import (
	"testing"

	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// requireCommitted fails when a tool left changes in the data dir that aren't
// in git, so every move and delete stays recoverable through history.
func requireCommitted(t *testing.T, svc *services.Services) {
	t.Helper()
	pending, err := svc.GitService.CommitPendingChanges("test: pending changes")
	require.NoError(t, err)
	assert.False(t, pending, "the tool left uncommitted changes")
}

func requireMissing(t *testing.T, svc *services.Services, p string) {
	t.Helper()
	_, err := svc.DocumentService.GetDocumentByPath(p)
	assert.Error(t, err, "%s should be gone", p)
}

func TestTools_MoveDocument(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/inbox/idea", "Idea", "Some idea.", "draft")
	seed(t, svc, "/index", "Index", "See [[Idea]].")
	seed(t, svc, "/taken", "Taken", "x")
	cs := connect(t, svc, true)

	var out moveOut
	structured(t, call(t, cs, "move_document", map[string]any{"path": "inbox/idea", "new_path": "/projects/idea.md"}), &out)
	assert.Equal(t, moveOut{From: "/inbox/idea", To: "/projects/idea", Message: "Moved /inbox/idea to /projects/idea"}, out)

	doc, err := svc.DocumentService.GetDocumentByPath("/projects/idea")
	require.NoError(t, err)
	assert.Equal(t, "Some idea.", doc.Content)
	assert.Equal(t, []string{"draft"}, doc.MetaData.Tags)
	requireMissing(t, svc, "/inbox/idea")
	requireCommitted(t, svc)

	var links backlinksOut
	structured(t, call(t, cs, "get_backlinks", map[string]any{"path": "/projects/idea"}), &links)
	assert.Equal(t, []pageEntry{{Title: "Index", Path: "/index"}}, links.Backlinks, "links by title still resolve")

	requireToolError(t, call(t, cs, "move_document", map[string]any{"path": "/projects/idea", "new_path": "/taken"}), "already exists")
	requireToolError(t, call(t, cs, "move_document", map[string]any{"path": "/missing", "new_path": "/x"}), "not found")
	requireToolError(t, call(t, cs, "move_document", map[string]any{"path": "/projects/idea", "new_path": "/"}), "new_path")
	requireToolError(t, call(t, cs, "move_document", map[string]any{"path": "/projects/idea", "new_path": "/../outside"}), "")
}

func TestTools_MoveFolder(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/work/2025/a", "A", "x")
	seed(t, svc, "/work/2025/deep/b", "B", "x")
	seed(t, svc, "/work/other", "Other", "x")
	cs := connect(t, svc, true)

	// Same parent: a rename.
	var out moveOut
	structured(t, call(t, cs, "move_folder", map[string]any{"path": "/work/2025", "new_path": "/work/archive-2025"}), &out)
	assert.Equal(t, "/work/archive-2025", out.To)
	assert.Equal(t, 2, out.Documents)
	for _, p := range []string{"/work/archive-2025/a", "/work/archive-2025/deep/b"} {
		_, err := svc.DocumentService.GetDocumentByPath(p)
		assert.NoError(t, err, p)
	}
	requireMissing(t, svc, "/work/2025/a")
	requireCommitted(t, svc)

	// Another parent: a move.
	structured(t, call(t, cs, "move_folder", map[string]any{"path": "/work/archive-2025", "new_path": "/old/work-2025"}), &out)
	assert.Equal(t, 2, out.Documents)
	_, err := svc.DocumentService.GetDocumentByPath("/old/work-2025/deep/b")
	assert.NoError(t, err)
	requireCommitted(t, svc)

	requireToolError(t, call(t, cs, "move_folder", map[string]any{"path": "/old", "new_path": "/work"}), "already exists")
	requireToolError(t, call(t, cs, "move_folder", map[string]any{"path": "/nope", "new_path": "/nope2"}), "not found")
	requireToolError(t, call(t, cs, "move_folder", map[string]any{"path": "/old", "new_path": "/old/inside"}), "into itself")
	requireToolError(t, call(t, cs, "move_folder", map[string]any{"path": "/", "new_path": "/x"}), "root")
}

func TestTools_DeleteDocument_MovesToTrash(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/notes/old", "Old", "first")
	seed(t, svc, "/index", "Index", "See [[Old]].")
	cs := connect(t, svc, true)

	res := call(t, cs, "delete_document", map[string]any{"path": "/notes/old"})
	var out deleteOut
	structured(t, res, &out)
	assert.Equal(t, "/notes/old", out.Path)
	assert.Equal(t, "/trash/notes/old", out.TrashPath)
	assert.Equal(t, []string{"/index"}, out.LinkedFrom, "pages whose links now break")
	assert.Contains(t, out.Message, "move_document")

	requireMissing(t, svc, "/notes/old")
	trashed, err := svc.DocumentService.GetDocumentByPath("/trash/notes/old")
	require.NoError(t, err)
	assert.Equal(t, "first", trashed.Content)
	requireCommitted(t, svc)

	var search searchOut
	structured(t, call(t, cs, "search", map[string]any{"query": "first"}), &search)
	assert.Zero(t, search.Total, "trashed pages are out of search")

	// Deleting a page of the same path again replaces the older trashed copy.
	seed(t, svc, "/notes/old", "Old", "second")
	structured(t, call(t, cs, "delete_document", map[string]any{"path": "/notes/old"}), &out)
	trashed, err = svc.DocumentService.GetDocumentByPath("/trash/notes/old")
	require.NoError(t, err)
	assert.Equal(t, "second", trashed.Content)
	requireCommitted(t, svc)

	// Restoring is a move back out of the trash.
	structured(t, call(t, cs, "move_document", map[string]any{"path": "/trash/notes/old", "new_path": "/notes/old"}), &moveOut{})
	_, err = svc.DocumentService.GetDocumentByPath("/notes/old")
	assert.NoError(t, err)

	requireToolError(t, call(t, cs, "delete_document", map[string]any{"path": "/missing"}), "not found")
}

func TestTools_DeleteDocument_RefusesPermanentDelete(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/trash/gone", "Gone", "x")
	cs := connect(t, svc, true)

	requireToolError(t, call(t, cs, "delete_document", map[string]any{"path": "/trash/gone"}), "already in the trash")
	_, err := svc.DocumentService.GetDocumentByPath("/trash/gone")
	assert.NoError(t, err)
}

func TestTools_DeleteFolder_MovesToTrash(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/projects/alpha/plan", "Plan", "x")
	seed(t, svc, "/projects/alpha/deep/notes", "Notes", "y")
	cs := connect(t, svc, true)

	var out deleteOut
	structured(t, call(t, cs, "delete_folder", map[string]any{"path": "/projects/alpha"}), &out)
	assert.Equal(t, "/trash/projects/alpha", out.TrashPath)
	assert.Equal(t, 2, out.Documents)
	_, err := svc.DocumentService.GetDocumentByPath("/trash/projects/alpha/deep/notes")
	require.NoError(t, err)
	requireMissing(t, svc, "/projects/alpha/plan")
	requireCommitted(t, svc)

	// A second folder of the same path doesn't overwrite the first in the trash.
	seed(t, svc, "/projects/alpha/plan", "Plan", "again")
	structured(t, call(t, cs, "delete_folder", map[string]any{"path": "/projects/alpha"}), &out)
	assert.NotEqual(t, "/trash/projects/alpha", out.TrashPath)
	assert.Contains(t, out.TrashPath, "/trash/projects/alpha-")
	_, err = svc.DocumentService.GetDocumentByPath(out.TrashPath + "/plan")
	require.NoError(t, err)
	_, err = svc.DocumentService.GetDocumentByPath("/trash/projects/alpha/plan")
	require.NoError(t, err, "the earlier trashed folder is kept")
	requireCommitted(t, svc)

	// Restoring to another place gives the pages their new paths.
	structured(t, call(t, cs, "move_folder", map[string]any{"path": "/trash/projects/alpha", "new_path": "/restored/alpha"}), &moveOut{})
	var restored folderOut
	structured(t, call(t, cs, "list_folder", map[string]any{"path": "/restored/alpha"}), &restored)
	require.Len(t, restored.Documents, 1)
	assert.Equal(t, "/restored/alpha/plan", restored.Documents[0].Path)
	doc, err := svc.DocumentService.GetDocumentByPath("/restored/alpha/deep/notes")
	require.NoError(t, err)
	assert.Equal(t, "/restored/alpha/deep/notes", doc.MetaData.Path)
	requireCommitted(t, svc)

	requireToolError(t, call(t, cs, "delete_folder", map[string]any{"path": "/"}), "root")
	requireToolError(t, call(t, cs, "delete_folder", map[string]any{"path": "/trash"}), "trash")
	requireToolError(t, call(t, cs, "delete_folder", map[string]any{"path": "/nope"}), "not found")
}

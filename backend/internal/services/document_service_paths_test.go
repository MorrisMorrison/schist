package services_test

import (
	"archive/zip"
	"bytes"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
)

func TestDocumentService_RejectsBadInput(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	mustCreate(t, ds, "/note", "Note", "precious")

	badPaths := []string{"", "relative", "/../escape", "/a/./b", "/has space", "/semi;colon", "/back\\slash"}
	for _, p := range badPaths {
		t.Run("path "+p, func(t *testing.T) {
			_, err := ds.GetDocumentByPath(p)
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(err))
			_, err = ds.GetFolder(p)
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(err))
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(ds.CreateFolder(p)))
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(ds.MoveDocument(p, "/x")))
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(ds.MoveDocument("/note", p)))
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(ds.MoveFolder(p, "/a/b")))
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(ds.MoveFolder("/a", p)))
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(ds.RenameFolder(p, "x")))
			if p != "" && p != "relative" {
				// DeleteDocument adds the leading slash itself.
				assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(ds.DeleteDocument(p)))
			}
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(ds.UpdateDocumentWithSaveType(
				&models.Document{MetaData: &models.DocumentMetaData{Title: "x", Path: p}}, "manual")))
			if p != "" {
				assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(ds.CreateDocument(
					&models.Document{MetaData: &models.DocumentMetaData{Title: "x", Path: p}})))
			}
		})
	}

	t.Run("missing metadata", func(t *testing.T) {
		assert.Equal(t, apierrors.ErrCodeMissingRequired, apiErrorCode(ds.CreateDocument(&models.Document{})))
		assert.Equal(t, apierrors.ErrCodeMissingRequired, apiErrorCode(ds.UpdateDocumentWithSaveType(&models.Document{}, "manual")))
	})

	data, err := os.ReadFile(filepath.Join(dir, "note.md"))
	require.NoError(t, err)
	assert.Contains(t, string(data), "precious", "rejected requests must leave notes untouched")
}

func TestDocumentService_CreateDerivesSlugAndPath(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	doc := &models.Document{MetaData: &models.DocumentMetaData{Title: "Hello World"}, Content: "x"}
	require.NoError(t, ds.CreateDocument(doc))
	assert.Equal(t, "hello-world", doc.MetaData.Slug)
	assert.Equal(t, "/hello-world", doc.MetaData.Path)
	_, err := os.Stat(filepath.Join(dir, "hello-world.md"))
	assert.NoError(t, err)
}

func TestDocumentService_UnreadableDocument(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	mustCreate(t, ds, "/good", "Good", "ok")
	// A directory where the note file should be cannot be read as a note.
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "weird.md"), 0755))

	_, err := ds.GetDocumentByPath("/weird")
	require.Error(t, err)
	assert.False(t, apierrors.IsAPIError(err), "an I/O failure is internal, not a 4xx")

	assert.Error(t, ds.MoveDocument("/weird", "/elsewhere"))

	docs, err := ds.ListDocuments()
	require.NoError(t, err)
	require.Len(t, docs, 1, "unreadable entries are skipped, the rest still list")
	assert.Equal(t, "/good", docs[0].MetaData.Path)
}

func TestDocumentService_MoveDocument(t *testing.T) {
	t.Run("same path after normalisation is a no-op", func(t *testing.T) {
		ds, _ := newSafetyDocumentService(t)
		mustCreate(t, ds, "/a", "A", "a")
		require.NoError(t, ds.MoveDocument("/a", "/a/"))
		require.NoError(t, ds.MoveDocument("/a", "//a"))
		_, err := ds.GetDocumentByPath("/a")
		assert.NoError(t, err)
	})

	t.Run("missing source", func(t *testing.T) {
		ds, _ := newSafetyDocumentService(t)
		assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(ds.MoveDocument("/nope", "/b")))
	})

	t.Run("into a new folder", func(t *testing.T) {
		ds, dir := newSafetyDocumentService(t)
		mustCreate(t, ds, "/a", "A", "content")
		require.NoError(t, ds.MoveDocument("/a", "/archive/2024/a-renamed"))

		moved, err := ds.GetDocumentByPath("/archive/2024/a-renamed")
		require.NoError(t, err)
		assert.Equal(t, "/archive/2024/a-renamed", moved.MetaData.Path)
		assert.Equal(t, "a-renamed", moved.MetaData.Slug)
		assert.Equal(t, "content", strings.TrimSpace(moved.Content))
		_, err = os.Stat(filepath.Join(dir, "a.md"))
		assert.True(t, os.IsNotExist(err))
	})
}

func TestDocumentService_DeleteDocumentMissing(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(ds.DeleteDocument("/nope")))
}

func TestDocumentService_FolderViews(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	mustCreate(t, ds, "/top", "Top", "t")
	mustCreate(t, ds, "/work/a", "A", "a")
	mustCreate(t, ds, "/work/b", "B", "b")
	mustCreate(t, ds, "/work/projects/c", "C", "c")
	mustCreate(t, ds, "/work/projects/deep/d", "D", "d")
	require.NoError(t, ds.CreateFolder("/empty"))
	// The data dir's internal directories never show up as folders.
	for _, internal := range []string{"assets", "uploads", "trash", "invites"} {
		require.NoError(t, os.MkdirAll(filepath.Join(dir, internal), 0755))
	}
	require.NoError(t, os.WriteFile(filepath.Join(dir, "work", "notes.txt"), []byte("x"), 0644))

	folderNames := func(fs []*models.Folder) []string {
		var names []string
		for _, f := range fs {
			names = append(names, f.Name)
		}
		sort.Strings(names)
		return names
	}

	t.Run("root folder", func(t *testing.T) {
		root, err := ds.GetFolder("/")
		require.NoError(t, err)
		assert.Equal(t, "Root", root.Name)
		assert.Equal(t, 1, root.DocumentCount)
		assert.Equal(t, []string{"empty", "work"}, folderNames(root.SubFolders))
		for _, f := range root.SubFolders {
			if f.Name == "work" {
				assert.Equal(t, 2, f.DocumentCount)
				assert.Equal(t, "/work", f.Path)
			}
		}
	})

	t.Run("nested folder", func(t *testing.T) {
		work, err := ds.GetFolder("/work")
		require.NoError(t, err)
		assert.Equal(t, "work", work.Name)
		assert.Equal(t, 2, work.DocumentCount)
		assert.Equal(t, []string{"projects"}, folderNames(work.SubFolders))
		assert.Equal(t, 1, work.SubFolders[0].DocumentCount)
		assert.Equal(t, "/work/projects", work.SubFolders[0].Path)
	})

	t.Run("not a folder", func(t *testing.T) {
		_, err := ds.GetFolder("/top")
		assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))
		require.NoError(t, os.WriteFile(filepath.Join(dir, "plainfile"), []byte("x"), 0644))
		_, err = ds.GetFolder("/plainfile")
		assert.Equal(t, apierrors.ErrCodeValidation, apiErrorCode(err))
	})

	t.Run("tree", func(t *testing.T) {
		tree, err := ds.GetFolderTree()
		require.NoError(t, err)
		assert.Equal(t, []string{"empty", "work"}, folderNames(tree))
		var work *models.Folder
		for _, f := range tree {
			if f.Name == "work" {
				work = f
			}
		}
		require.NotNil(t, work)
		assert.Equal(t, 2, work.DocumentCount)
		require.Equal(t, []string{"projects"}, folderNames(work.SubFolders))
		projects := work.SubFolders[0]
		assert.Equal(t, 1, projects.DocumentCount)
		require.Equal(t, []string{"deep"}, folderNames(projects.SubFolders))
		assert.Equal(t, "/work/projects/deep", projects.SubFolders[0].Path)
		assert.Equal(t, 1, projects.SubFolders[0].DocumentCount)
	})
}

func TestDocumentService_MoveFolderRewritesAndRollsBack(t *testing.T) {
	t.Run("rewrites the paths of every note inside", func(t *testing.T) {
		ds, dir := newSafetyDocumentService(t)
		mustCreate(t, ds, "/inbox/a", "A", "a")
		mustCreate(t, ds, "/inbox/sub/b", "B", "b")
		mustCreate(t, ds, "/inbox-other/c", "C", "c")

		require.NoError(t, ds.MoveFolder("/inbox", "/archive/2024/inbox"))

		for _, p := range []string{"/archive/2024/inbox/a", "/archive/2024/inbox/sub/b"} {
			doc, err := ds.GetDocumentByPath(p)
			require.NoError(t, err, p)
			assert.Equal(t, p, doc.MetaData.Path)
		}
		other, err := ds.GetDocumentByPath("/inbox-other/c")
		require.NoError(t, err, "a sibling sharing the name prefix is not moved")
		assert.Equal(t, "/inbox-other/c", other.MetaData.Path)
		_, err = os.Stat(filepath.Join(dir, "inbox"))
		assert.True(t, os.IsNotExist(err))
	})

	tests := []struct {
		name     string
		from, to string
		code     apierrors.ErrorCode
	}{
		{"root", "/", "/a/b", apierrors.ErrCodeValidation},
		{"to root level", "/inbox", "/inbox2", apierrors.ErrCodeValidation},
		{"into itself", "/inbox", "/inbox/sub/x", apierrors.ErrCodeValidation},
		{"missing source", "/nope", "/a/nope", apierrors.ErrCodeNotFound},
		{"existing target", "/inbox", "/keep/inbox", apierrors.ErrCodeAlreadyExists},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ds, _ := newSafetyDocumentService(t)
			mustCreate(t, ds, "/inbox/a", "A", "a")
			mustCreate(t, ds, "/keep/inbox/z", "Z", "z")

			assert.Equal(t, tt.code, apiErrorCode(ds.MoveFolder(tt.from, tt.to)))
			_, err := ds.GetDocumentByPath("/inbox/a")
			assert.NoError(t, err, "a rejected move leaves the folder in place")
			_, err = ds.GetDocumentByPath("/keep/inbox/z")
			assert.NoError(t, err, "a rejected move never touches the target")
		})
	}

	t.Run("a note that cannot be rewritten rolls the move back", func(t *testing.T) {
		ds, dir := newSafetyDocumentService(t)
		mustCreate(t, ds, "/inbox/a", "A", "a")
		// A note whose stored path points elsewhere is listed but cannot be
		// found in the moved folder, so the rewrite fails.
		require.NoError(t, os.WriteFile(filepath.Join(dir, "inbox", "stray.md"),
			[]byte("---\ntitle: Stray\npath: /inbox/gone/stray\n---\nx\n"), 0644))

		err := ds.MoveFolder("/inbox", "/archive/inbox")
		require.Error(t, err)
		_, statErr := os.Stat(filepath.Join(dir, "inbox", "a.md"))
		assert.NoError(t, statErr, "the folder must be back where it was")
		_, statErr = os.Stat(filepath.Join(dir, "archive", "inbox"))
		assert.True(t, os.IsNotExist(statErr))
	})
}

func TestDocumentService_RenameFolderErrors(t *testing.T) {
	tests := []struct {
		name    string
		path    string
		newName string
		code    apierrors.ErrorCode
	}{
		{"root", "/", "x", apierrors.ErrCodeValidation},
		{"double slash root", "//", "x", apierrors.ErrCodeValidation},
		{"empty name", "/inbox", "", apierrors.ErrCodeValidation},
		{"name with slash", "/inbox", "a/b", apierrors.ErrCodeValidation},
		{"missing folder", "/nope", "x", apierrors.ErrCodeNotFound},
		{"name taken", "/inbox", "keep", apierrors.ErrCodeAlreadyExists},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ds, _ := newSafetyDocumentService(t)
			mustCreate(t, ds, "/inbox/a", "A", "a")
			mustCreate(t, ds, "/keep/z", "Z", "z")
			assert.Equal(t, tt.code, apiErrorCode(ds.RenameFolder(tt.path, tt.newName)))
			_, err := ds.GetDocumentByPath("/inbox/a")
			assert.NoError(t, err)
			_, err = ds.GetDocumentByPath("/keep/z")
			assert.NoError(t, err)
		})
	}

	t.Run("a note that cannot be rewritten is reported", func(t *testing.T) {
		ds, dir := newSafetyDocumentService(t)
		mustCreate(t, ds, "/inbox/a", "A", "a")
		require.NoError(t, os.WriteFile(filepath.Join(dir, "inbox", "stray.md"),
			[]byte("---\ntitle: Stray\npath: /inbox/gone/stray\n---\nx\n"), 0644))
		assert.Error(t, ds.RenameFolder("/inbox", "outbox"))
	})
}

func TestDocumentService_SearchAndTagsIgnoreInternalDirs(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	require.NoError(t, ds.CreateDocument(&models.Document{
		MetaData: &models.DocumentMetaData{Title: "Go Notes", Path: "/go", Tags: []string{"golang"}}, Content: "x",
	}))
	mustCreate(t, ds, "/untagged", "Go Untagged", "y")
	// A markdown file inside an ignored directory is not a note.
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "trash"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "trash", "old.md"),
		[]byte("---\ntitle: Go Old\npath: /trash/old\ntags: [golang]\n---\nz\n"), 0644))

	results, err := ds.Search("go")
	require.NoError(t, err)
	assert.Len(t, results, 2)

	results, err = ds.Search("go tag:golang")
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "/go", results[0].MetaData.Path)

	results, err = ds.Search("tag:")
	require.NoError(t, err)
	assert.Len(t, results, 2, "an empty tag filter is ignored")

	tags, err := ds.GetAllTags()
	require.NoError(t, err)
	assert.Equal(t, map[string]int{"golang": 1}, tags)
}

func TestDocumentService_ImportTargetsAndTitles(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	require.NoError(t, ds.CreateFolder("/imports"))

	result, err := ds.ImportDocuments(multipartFiles(t, map[string]string{
		"heading.md":  "# From Heading\n\nbody",
		"no-title.MD": "just text",
		"blank.md":    "#   \n\nno real heading",
	}), &models.ImportOptions{TargetPath: "imports/"})
	require.NoError(t, err)
	assert.Equal(t, 3, result.ImportedCount, "failed: %+v", result.Failed)

	paths := map[string]string{}
	for _, s := range result.Success {
		paths[s.OriginalName] = s.FinalPath
	}
	assert.Equal(t, "/imports/from-heading", paths["heading.md"])
	assert.Equal(t, "/imports/no-title", paths["no-title.MD"])
	assert.Equal(t, "/imports/blank", paths["blank.md"])

	t.Run("default target is the root", func(t *testing.T) {
		result, err := ds.ImportDocuments(multipartFiles(t, map[string]string{"root.md": "# Root Note"}),
			&models.ImportOptions{})
		require.NoError(t, err)
		require.Len(t, result.Success, 1)
		assert.Equal(t, "/root-note", result.Success[0].FinalPath)
	})

	t.Run("invalid target path fails per file without writing", func(t *testing.T) {
		result, err := ds.ImportDocuments(multipartFiles(t, map[string]string{"x.md": "# X"}),
			&models.ImportOptions{TargetPath: "/bad path"})
		require.NoError(t, err)
		assert.Equal(t, 1, result.FailedCount)
		require.Len(t, result.Failed, 1)
		assert.NotContains(t, result.Failed[0].Error, string(os.PathSeparator)+"tmp", "no file system details leak")
	})
}

func zipContents(t *testing.T, data []byte) map[string]string {
	t.Helper()
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	require.NoError(t, err)
	out := map[string]string{}
	for _, f := range r.File {
		rc, err := f.Open()
		require.NoError(t, err)
		b, err := io.ReadAll(rc)
		require.NoError(t, err)
		require.NoError(t, rc.Close())
		out[f.Name] = string(b)
	}
	return out
}

func TestDocumentService_ExportAllAndDocument(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	mustCreate(t, ds, "/top", "Top", "top body")
	mustCreate(t, ds, "/work/a", "Alpha", "alpha body")
	mustCreate(t, ds, "/work/deep/b", "Beta", "beta body")
	mustCreate(t, ds, "/work/dots", "...", "untitled body")

	data, filename, err := ds.ExportAll()
	require.NoError(t, err)
	assert.Equal(t, "all-documents.zip", filename)
	contents := zipContents(t, data)
	assert.Equal(t, "# Top\n\ntop body", contents["Top.md"])
	assert.Equal(t, "# Alpha\n\nalpha body", contents["work/Alpha.md"])
	assert.Equal(t, "# Beta\n\nbeta body", contents["work/deep/Beta.md"])
	assert.Contains(t, contents, "work/untitled.md", "a title with no usable characters still exports")

	t.Run("root folder export is named documents.zip", func(t *testing.T) {
		_, filename, err := ds.ExportFolder("/")
		require.NoError(t, err)
		assert.Equal(t, "documents.zip", filename)
	})

	t.Run("single document", func(t *testing.T) {
		content, filename, err := ds.ExportDocument("/work/a")
		require.NoError(t, err)
		assert.Equal(t, "a.md", filename)
		assert.Equal(t, "# Alpha\n\nalpha body", string(content))
	})
}

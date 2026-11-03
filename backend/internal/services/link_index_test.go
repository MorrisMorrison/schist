package services_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
)

func newIndexedWiki(t *testing.T) (*services.DocumentService, *services.LinkService, string) {
	t.Helper()
	ds, dir := newSafetyDocumentService(t)
	return ds, services.NewLinkService(ds, services.NewIgnoreService(dir)), dir
}

func backlinksOf(t *testing.T, ls *services.LinkService, path string) []string {
	t.Helper()
	backlinks, err := ls.GetBacklinks(path)
	require.NoError(t, err)
	return backlinks
}

func outgoing(t *testing.T, ls *services.LinkService, path string) map[string]bool {
	t.Helper()
	links, err := ls.GetOutgoingLinks(path)
	require.NoError(t, err)
	valid := map[string]bool{}
	for _, link := range links {
		valid[link.Target] = link.IsValid
	}
	return valid
}

func updateContent(t *testing.T, ds *services.DocumentService, path, title, content string) {
	t.Helper()
	require.NoError(t, ds.UpdateDocumentWithSaveType(&models.Document{
		MetaData: &models.DocumentMetaData{Title: title, Path: path},
		Content:  content,
	}, "manual"))
}

func TestLinkIndex_FollowsCreateUpdateAndDelete(t *testing.T) {
	ds, ls, _ := newIndexedWiki(t)
	mustCreate(t, ds, "/target", "Target", "t")
	mustCreate(t, ds, "/a", "A", "to [[Target]]")
	assert.Equal(t, []string{"/a"}, backlinksOf(t, ls, "/target"))

	// A new page shows up without anyone calling UpdateBacklinks.
	mustCreate(t, ds, "/b", "B", "also [[target|alias]]")
	assert.Equal(t, []string{"/a", "/b"}, backlinksOf(t, ls, "/target"))

	// Removing the link removes the backlink.
	updateContent(t, ds, "/a", "A", "no links now")
	assert.Equal(t, []string{"/b"}, backlinksOf(t, ls, "/target"))

	// Deleting the source removes its backlinks.
	require.NoError(t, ds.DeleteDocument("/b"))
	assert.Empty(t, backlinksOf(t, ls, "/target"))

	// Deleting the target makes links to it broken.
	updateContent(t, ds, "/a", "A", "to [[Target]]")
	assert.True(t, outgoing(t, ls, "/a")["Target"])
	require.NoError(t, ds.DeleteDocument("/target"))
	assert.False(t, outgoing(t, ls, "/a")["Target"])
	assert.Empty(t, backlinksOf(t, ls, "/target"))
	broken, err := ls.GetBrokenLinks()
	require.NoError(t, err)
	require.Len(t, broken["/a"], 1)
	assert.Equal(t, "Target", broken["/a"][0].Target)
}

func TestLinkIndex_TitleRename(t *testing.T) {
	ds, ls, _ := newIndexedWiki(t)
	mustCreate(t, ds, "/notes", "Old Title", "t")
	mustCreate(t, ds, "/a", "A", "[[Old Title]] and [[New Title]]")
	assert.Equal(t, map[string]bool{"Old Title": true, "New Title": false}, outgoing(t, ls, "/a"))

	updateContent(t, ds, "/notes", "New Title", "t")

	assert.Equal(t, map[string]bool{"Old Title": false, "New Title": true}, outgoing(t, ls, "/a"))
	assert.Equal(t, []string{"/a"}, backlinksOf(t, ls, "/notes"))
}

func TestLinkIndex_MoveDocument(t *testing.T) {
	ds, ls, _ := newIndexedWiki(t)
	mustCreate(t, ds, "/target", "Target", "t")
	mustCreate(t, ds, "/src", "Src", "to [[Target]]")
	require.Equal(t, []string{"/src"}, backlinksOf(t, ls, "/target"))

	// Moving the target: links by title follow it.
	require.NoError(t, ds.MoveDocument("/target", "/archive/target"))
	assert.Empty(t, backlinksOf(t, ls, "/target"))
	assert.Equal(t, []string{"/src"}, backlinksOf(t, ls, "/archive/target"))

	// Moving the source: its backlinks move with it.
	require.NoError(t, ds.MoveDocument("/src", "/inbox/src"))
	assert.Equal(t, []string{"/inbox/src"}, backlinksOf(t, ls, "/archive/target"))
	links, err := ls.GetOutgoingLinks("/inbox/src")
	require.NoError(t, err)
	require.Len(t, links, 1)
	assert.Equal(t, "/archive/target", links[0].Path)

	_, err = ls.GetOutgoingLinks("/src")
	assert.Error(t, err, "the old path is gone")
}

func TestLinkIndex_FolderOperations(t *testing.T) {
	ds, ls, _ := newIndexedWiki(t)
	require.NoError(t, ds.CreateFolder("/projects"))
	mustCreate(t, ds, "/projects/plan", "Plan", "to [[Home]]")
	mustCreate(t, ds, "/home", "Home", "see [[Plan]]")
	require.Equal(t, []string{"/projects/plan"}, backlinksOf(t, ls, "/home"))
	require.Equal(t, []string{"/home"}, backlinksOf(t, ls, "/projects/plan"))

	require.NoError(t, ds.RenameFolder("/projects", "work"))
	assert.Equal(t, []string{"/work/plan"}, backlinksOf(t, ls, "/home"))
	assert.Equal(t, []string{"/home"}, backlinksOf(t, ls, "/work/plan"))
	assert.Empty(t, backlinksOf(t, ls, "/projects/plan"))

	require.NoError(t, ds.CreateFolder("/archive"))
	require.NoError(t, ds.MoveFolder("/work", "/archive/work"))
	assert.Equal(t, []string{"/archive/work/plan"}, backlinksOf(t, ls, "/home"))
	assert.Equal(t, []string{"/home"}, backlinksOf(t, ls, "/archive/work/plan"))

	require.NoError(t, ds.DeleteFolder("/archive"))
	assert.Empty(t, backlinksOf(t, ls, "/home"))
	assert.False(t, outgoing(t, ls, "/home")["Plan"])
}

func TestLinkIndex_Import(t *testing.T) {
	ds, ls, _ := newIndexedWiki(t)
	mustCreate(t, ds, "/home", "Home", "see [[Tomato plant]]")
	assert.False(t, outgoing(t, ls, "/home")["Tomato plant"])

	result, err := ds.ImportFiles(importFiles(map[string]string{
		"garden/tomato.md": "---\ntitle: Tomato plant\n---\nGrows in [[soil]].\n",
		"garden/soil.md":   "# Soil\n\nFeeds the [[tomato]].\n",
	}), &models.ImportOptions{TargetPath: "/", OverwriteMode: "rename"})
	require.NoError(t, err)
	require.Len(t, result.Success, 2)
	var imported []string
	paths := map[string]string{} // original file -> page path
	for _, doc := range result.Success {
		imported = append(imported, doc.FinalPath)
		paths[doc.OriginalName] = doc.FinalPath
	}
	require.NoError(t, ls.UpdateBacklinksFor(imported...))

	assert.True(t, outgoing(t, ls, "/home")["Tomato plant"])
	tomato, soil := importedPath(t, paths, "tomato.md"), importedPath(t, paths, "soil.md")
	assert.ElementsMatch(t, []string{"/home", soil}, backlinksOf(t, ls, tomato))
	assert.Equal(t, []string{tomato}, backlinksOf(t, ls, soil))
}

func importedPath(t *testing.T, paths map[string]string, file string) string {
	t.Helper()
	for original, final := range paths {
		if strings.HasSuffix(original, file) {
			return final
		}
	}
	t.Fatalf("%s was not imported: %v", file, paths)
	return ""
}

func TestLinkIndex_PicksUpEditsOutsideTheApp(t *testing.T) {
	ds, ls, dir := newIndexedWiki(t)
	mustCreate(t, ds, "/target", "Target", "t")
	mustCreate(t, ds, "/src", "Src", "nothing yet")
	assert.Empty(t, backlinksOf(t, ls, "/target"))

	file := filepath.Join(dir, "src.md")
	raw, err := os.ReadFile(file)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(file, append(raw, []byte("\nnow [[Target]]\n")...), 0o644))
	assert.Equal(t, []string{"/src"}, backlinksOf(t, ls, "/target"))

	require.NoError(t, os.Remove(file))
	assert.Empty(t, backlinksOf(t, ls, "/target"))
}

// A save can keep a file's size and, within the clock's resolution, its
// modification time. UpdateBacklinks makes the index re-read it anyway.
func TestLinkIndex_UpdateBacklinksRereadsSameSizeSave(t *testing.T) {
	ds, ls, dir := newIndexedWiki(t)
	mustCreate(t, ds, "/aaaa", "Aaaa", "t")
	mustCreate(t, ds, "/bbbb", "Bbbb", "t")
	mustCreate(t, ds, "/src", "Src", "to [[Aaaa]]")
	require.Equal(t, []string{"/src"}, backlinksOf(t, ls, "/aaaa"))

	file := filepath.Join(dir, "src.md")
	info, err := os.Stat(file)
	require.NoError(t, err)
	raw, err := os.ReadFile(file)
	require.NoError(t, err)
	edited := []byte(string(raw[:len(raw)-len("[[Aaaa]]\n")]) + "[[Bbbb]]\n")
	if string(raw) == string(edited) || len(raw) != len(edited) {
		t.Fatalf("test setup: expected a same-size edit of %q", raw)
	}
	require.NoError(t, os.WriteFile(file, edited, 0o644))
	require.NoError(t, os.Chtimes(file, info.ModTime(), info.ModTime()))

	require.NoError(t, ls.UpdateBacklinks("/src"))
	assert.Empty(t, backlinksOf(t, ls, "/aaaa"))
	assert.Equal(t, []string{"/src"}, backlinksOf(t, ls, "/bbbb"))
}

func TestLinkIndex_UpdateBacklinksErrors(t *testing.T) {
	ds, ls, _ := newIndexedWiki(t)
	mustCreate(t, ds, "/a", "A", "t")
	assert.NoError(t, ls.UpdateBacklinksFor("/a"))
	assert.Error(t, ls.UpdateBacklinksFor("/a", "/missing"))
	assert.Error(t, ls.UpdateBacklinks("/../outside"))
	_, err := ls.GetBacklinks("/../outside")
	assert.Error(t, err)
}

// TestLinkService_ConcurrentReadsAndWrites reads links while pages change on
// disk; run with -race in CI. Writers edit the files directly, because
// concurrent git commits of deletes race in go-git's staging, apart from
// the index.
func TestLinkService_ConcurrentReadsAndWrites(t *testing.T) {
	ds, ls, dir := newIndexedWiki(t)
	mustCreate(t, ds, "/target", "Target", "t")

	const writers = 4
	page := func(w int, linked bool) []byte {
		body := "no link"
		if linked {
			body = "to [[Target]]"
		}
		return []byte(fmt.Sprintf("---\ntitle: W%d\npath: /w%d\n---\n%s\n", w, w, body))
	}

	var wg sync.WaitGroup
	for w := 0; w < writers; w++ {
		wg.Add(2)
		go func(w int) {
			defer wg.Done()
			file := filepath.Join(dir, fmt.Sprintf("w%d.md", w))
			for j := 0; j < 10; j++ {
				assert.NoError(t, os.WriteFile(file, page(w, j%2 == 0), 0o644))
				assert.NoError(t, ls.UpdateBacklinks(fmt.Sprintf("/w%d", w)))
			}
			// Writers 0 and 1 end linked, 2 and 3 are deleted.
			if w < 2 {
				assert.NoError(t, os.WriteFile(file, page(w, true), 0o644))
			} else {
				assert.NoError(t, os.Remove(file))
			}
			assert.NoError(t, ls.UpdateBacklinks("/target"))
		}(w)
		go func() {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				_, err := ls.GetBacklinks("/target")
				assert.NoError(t, err)
				_, err = ls.GetBrokenLinks()
				assert.NoError(t, err)
				_, err = ls.GetOutgoingLinks("/target")
				assert.NoError(t, err)
				ls.ParseWikiLinks("[[Target]]")
			}
		}()
	}
	wg.Wait()

	require.NoError(t, ls.UpdateBacklinksFor("/w0", "/w1"))
	assert.Equal(t, []string{"/w0", "/w1"}, backlinksOf(t, ls, "/target"))
}

package services_test

import (
	"archive/zip"
	"bytes"
	"mime/multipart"
	"testing"
	"time"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func importFiles(files map[string]string) []models.ImportFile {
	var out []models.ImportFile
	for p, c := range files {
		out = append(out, models.ImportFile{Path: p, Content: []byte(c)})
	}
	return out
}

func byOriginal(docs []models.ImportedDocument) map[string]models.ImportedDocument {
	out := map[string]models.ImportedDocument{}
	for _, d := range docs {
		out[d.OriginalName] = d
	}
	return out
}

func TestImportFiles_ObsidianFolder(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)

	result, err := ds.ImportFiles(importFiles(map[string]string{
		"homelab/devices/docki.md": "---\ntitle: Docki host\ntags: [homelab]\ncreated: 2025-03-04\nstatus: active\n---\n" +
			"Runs on [[network|the LAN]]. ```dataview\n",
		"homelab/network.md":        "# Network\n\nBack to [[docki]] and [[homelab/devices/docki#Disks]].\n\n```dataview\nLIST\n```\n",
		".agents/coach/progress.md": "No front matter, just notes. See [the host](../../homelab/devices/docki.md).",
		".obsidian/workspace.json":  "{}",
		"homelab/diagram.png":       "PNG",
		"homelab/.gitkeep":          "",
	}), &models.ImportOptions{TargetPath: "/vault"})
	require.NoError(t, err)
	require.Empty(t, result.Failed)
	assert.Equal(t, 6, result.TotalFiles)
	assert.Equal(t, 3, result.ImportedCount)
	assert.Equal(t, 3, result.SkippedCount)

	ok := byOriginal(result.Success)
	assert.Equal(t, "/vault/homelab/devices/docki", ok["homelab/devices/docki.md"].FinalPath)
	assert.Equal(t, "/vault/homelab/network", ok["homelab/network.md"].FinalPath)
	assert.Equal(t, "/vault/agents/coach/progress", ok[".agents/coach/progress.md"].FinalPath, "hidden folders lose their dot")
	assert.Contains(t, ok["homelab/network.md"].Notes, "1 × removed Dataview query")

	skipped := byOriginal(result.Skipped)
	assert.Equal(t, []string{"skipped folder .obsidian"}, skipped[".obsidian/workspace.json"].Notes)
	assert.Equal(t, []string{"not a markdown file"}, skipped["homelab/diagram.png"].Notes)
	assert.Equal(t, []string{"hidden file"}, skipped["homelab/.gitkeep"].Notes)

	docki, err := ds.GetDocumentByPath("/vault/homelab/devices/docki")
	require.NoError(t, err)
	assert.Equal(t, "Docki host", docki.MetaData.Title)
	assert.Equal(t, []string{"homelab"}, docki.MetaData.Tags)
	assert.Equal(t, time.Date(2025, 3, 4, 0, 0, 0, 0, time.UTC), docki.MetaData.Created.UTC(), "dates are kept")
	assert.Equal(t, map[string]any{"status": "active"}, docki.MetaData.Properties, "custom front matter is kept")
	assert.Contains(t, docki.Content, "[[Network|the LAN]]")

	network, err := ds.GetDocumentByPath("/vault/homelab/network")
	require.NoError(t, err)
	assert.Equal(t, "# Network\n\nBack to [[Docki host]] and [[Docki host|docki › Disks]].", network.Content)

	progress, err := ds.GetDocumentByPath("/vault/agents/coach/progress")
	require.NoError(t, err)
	assert.Equal(t, "progress", progress.MetaData.Title, "no front matter or heading: the file name")
	assert.Equal(t, "No front matter, just notes. See [[Docki host|the host]].", progress.Content)
}

func TestImportFiles_NamesWithinOneImportNeverCollide(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)

	result, err := ds.ImportFiles(importFiles(map[string]string{
		"a/readme.md": "# Readme",
		"b/readme.md": "# Readme",
		"a b.md":      "# One",
		"a-b.md":      "# Two",
	}), &models.ImportOptions{OverwriteMode: "overwrite"})
	require.NoError(t, err)
	require.Equal(t, 4, result.ImportedCount, "%+v", result.Failed)

	ok := byOriginal(result.Success)
	assert.Equal(t, "/a/readme", ok["a/readme.md"].FinalPath)
	assert.Equal(t, "/b/readme", ok["b/readme.md"].FinalPath)
	assert.ElementsMatch(t, []string{"/a-b", "/a-b-1"}, []string{ok["a b.md"].FinalPath, ok["a-b.md"].FinalPath},
		"overwrite mode never lets two files of one import replace each other")
}

func TestImportFiles_RejectsPathsThatClimbOut(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)

	result, err := ds.ImportFiles(importFiles(map[string]string{
		"../outside.md":      "# Out",
		"a/../../escape.md":  "# Escape",
		`b\..\..\windows.md`: "# Win",
	}), &models.ImportOptions{})
	require.NoError(t, err)
	assert.Equal(t, 0, result.ImportedCount)
	assert.Equal(t, 3, result.FailedCount)
	for _, f := range result.Failed {
		assert.Equal(t, "invalid file path", f.Error)
	}
}

func zipUpload(t *testing.T, name string, files map[string]string) []*multipart.FileHeader {
	t.Helper()
	var archive bytes.Buffer
	zw := zip.NewWriter(&archive)
	for p, c := range files {
		w, err := zw.Create(p)
		require.NoError(t, err)
		_, err = w.Write([]byte(c))
		require.NoError(t, err)
	}
	require.NoError(t, zw.Close())
	return multipartFiles(t, map[string]string{name: archive.String()})
}

func TestImportUploads_ZipAndFolderPaths(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)

	result, err := ds.ImportUploads(zipUpload(t, "vault.zip", map[string]string{
		"vault/projects/plan.md":   "# Plan\n\nSee [[Ideas]].",
		"vault/ideas.md":           "# Ideas",
		"vault/.obsidian/app.json": "{}",
	}), nil, &models.ImportOptions{})
	require.NoError(t, err)
	require.Empty(t, result.Failed)
	assert.ElementsMatch(t, []string{"/vault/projects/plan", "/vault/ideas"},
		[]string{result.Success[0].FinalPath, result.Success[1].FinalPath})
	assert.Equal(t, 1, result.SkippedCount)

	t.Run("relative paths from a folder upload", func(t *testing.T) {
		ds, _ := newSafetyDocumentService(t)
		files := multipartFiles(t, map[string]string{"note.md": "# Note"})
		result, err := ds.ImportUploads(files, []string{"my vault/sub/note.md"}, &models.ImportOptions{})
		require.NoError(t, err)
		require.Len(t, result.Success, 1)
		assert.Equal(t, "/my-vault/sub/note", result.Success[0].FinalPath)
	})

	t.Run("a broken zip fails alone", func(t *testing.T) {
		ds, _ := newSafetyDocumentService(t)
		result, err := ds.ImportUploads(multipartFiles(t, map[string]string{"bad.zip": "not a zip", "fine.md": "# Fine"}),
			nil, &models.ImportOptions{})
		require.NoError(t, err)
		assert.Equal(t, 1, result.ImportedCount)
		require.Len(t, result.Failed, 1)
		assert.Equal(t, "not a valid zip file", result.Failed[0].Error)
		assert.Equal(t, 2, result.TotalFiles)
	})
}

func TestImportFiles_OneCommitForTheWholeImport(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)

	result, err := ds.ImportFiles(importFiles(map[string]string{
		"a.md": "# A", "b.md": "# B", "sub/c.md": "# C",
	}), &models.ImportOptions{})
	require.NoError(t, err)
	require.Equal(t, 3, result.ImportedCount)

	hashes := map[string]bool{}
	for _, doc := range result.Success {
		versions, err := ds.GetDocumentVersions(doc.FinalPath)
		require.NoError(t, err)
		require.Len(t, versions, 1, doc.FinalPath)
		assert.Equal(t, "Import 3 documents", versions[0].Message)
		hashes[versions[0].Hash] = true
	}
	assert.Len(t, hashes, 1, "all three files are in the same commit")
}

func TestImportFiles_PathsComeFromFileNames(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)

	result, err := ds.ImportFiles(importFiles(map[string]string{
		"devices/router.md": "# router — main gateway\n\nBody.",
	}), &models.ImportOptions{TargetPath: "/lab"})
	require.NoError(t, err)
	require.Len(t, result.Success, 1)
	assert.Equal(t, "/lab/devices/router", result.Success[0].FinalPath)

	router, err := ds.GetDocumentByPath("/lab/devices/router")
	require.NoError(t, err)
	assert.Equal(t, "router — main gateway", router.MetaData.Title, "the title still comes from the heading")
}

func TestImportFiles_TwoBatchesLinkToEachOther(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	mustCreate(t, ds, "/notes/setup-guide", "Setting things up", "Written in the wiki.")
	options := func() *models.ImportOptions { return &models.ImportOptions{TargetPath: "/lab"} }

	first, err := ds.ImportFiles(importFiles(map[string]string{
		"devices/router.md": "# router — main gateway\n\nUplink to [[switch]]. See [[setup guide]].",
	}), options())
	require.NoError(t, err)
	require.Len(t, first.Success, 1)
	assert.Contains(t, first.Success[0].Notes, "1 × link not found in this import or the wiki (kept by name)")

	second, err := ds.ImportFiles(importFiles(map[string]string{
		"devices/switch.md": "# switch — core\n\nBack to [[router]] and [[devices/router#Ports|the gateway]].",
	}), options())
	require.NoError(t, err)
	require.Len(t, second.Success, 1)
	assert.Empty(t, second.Success[0].Notes, "every link resolved")

	router, err := ds.GetDocumentByPath("/lab/devices/router")
	require.NoError(t, err)
	assert.Equal(t, "# router — main gateway\n\nUplink to [[switch]]. See [[Setting things up]].", router.Content,
		"a page already in the wiki is found by its file name")

	switchPage, err := ds.GetDocumentByPath("/lab/devices/switch")
	require.NoError(t, err)
	assert.Equal(t, "# switch — core\n\nBack to [[router — main gateway]] and [[router — main gateway|the gateway]].",
		switchPage.Content, "links into the earlier batch resolve")
}

func TestImportFiles_IntoANewTargetFolder(t *testing.T) {
	tests := []struct {
		name, target, want string
	}{
		{"a new nested folder", "/new/sub", "/new/sub/note"},
		{"names are turned into slugs", "My Notes/2026 plans", "/my-notes/2026-plans/note"},
		{"valid names stay as they are", "/Projects/Q_1", "/Projects/Q_1/note"},
		{"backslashes and extra slashes", `\a\\b//`, "/a/b/note"},
		{"empty means the root", "  ", "/note"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ds, _ := newSafetyDocumentService(t)
			result, err := ds.ImportFiles(importFiles(map[string]string{"note.md": "# Note"}),
				&models.ImportOptions{TargetPath: tt.target})
			require.NoError(t, err)
			require.Len(t, result.Success, 1, "%+v", result.Failed)
			assert.Equal(t, tt.want, result.Success[0].FinalPath)
			_, err = ds.GetDocumentByPath(tt.want)
			require.NoError(t, err)
		})
	}

	t.Run("a target that climbs out is refused", func(t *testing.T) {
		ds, _ := newSafetyDocumentService(t)
		for _, target := range []string{"/../outside", "a/../../b", `..\x`} {
			_, err := ds.ImportFiles(importFiles(map[string]string{"note.md": "# Note"}),
				&models.ImportOptions{TargetPath: target})
			assert.Equal(t, apierrors.ErrCodeValidation, apiErrorCode(err), target)
		}
	})
}

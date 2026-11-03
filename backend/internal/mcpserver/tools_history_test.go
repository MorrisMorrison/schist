package mcpserver

import (
	"testing"

	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seedVersions creates /doc and saves it twice more, so it has three versions
// with the contents given, oldest first.
func seedVersions(t *testing.T, svc *services.Services, contents ...string) {
	t.Helper()
	seed(t, svc, "/doc", "Doc", contents[0])
	for _, c := range contents[1:] {
		doc, err := svc.DocumentService.GetDocumentByPath("/doc")
		require.NoError(t, err)
		doc.Content = c
		require.NoError(t, svc.DocumentService.UpdateDocumentWithSaveType(doc, "manual"))
	}
}

func TestTools_ListVersions(t *testing.T) {
	svc := newTestServices(t)
	seedVersions(t, svc, "one", "two", "three")
	cs := connect(t, svc, false)

	res := call(t, cs, "list_versions", map[string]any{"path": "/doc"})
	var out versionsOut
	structured(t, res, &out)
	require.Len(t, out.Versions, 3)
	newest := out.Versions[0]
	assert.Len(t, newest.Hash, 40)
	assert.Equal(t, newest.Hash[:7], newest.Short)
	assert.Contains(t, newest.Message, "Update document: /doc")
	assert.NotEmpty(t, newest.Date)
	assert.Contains(t, text(res), newest.Short)

	requireToolError(t, call(t, cs, "list_versions", map[string]any{"path": "/missing"}), "not found")
}

func TestTools_ReadVersion(t *testing.T) {
	svc := newTestServices(t)
	seedVersions(t, svc, "one", "two", "three")
	cs := connect(t, svc, false)

	var versions versionsOut
	structured(t, call(t, cs, "list_versions", map[string]any{"path": "/doc"}), &versions)
	oldest := versions.Versions[2]

	for _, v := range []string{oldest.Hash, oldest.Short} {
		var out versionOut
		structured(t, call(t, cs, "read_version", map[string]any{"path": "/doc", "version": v}), &out)
		assert.Equal(t, "one", out.Content, v)
		assert.Equal(t, oldest.Hash, out.Hash)
	}

	requireToolError(t, call(t, cs, "read_version", map[string]any{"path": "/doc", "version": "0000000"}), "no version")
	requireToolError(t, call(t, cs, "read_version", map[string]any{"path": "/doc", "version": "abc"}), "at least 7")
	requireToolError(t, call(t, cs, "read_version", map[string]any{"path": "/doc"}), "version")
}

func TestTools_DiffVersions(t *testing.T) {
	svc := newTestServices(t)
	seedVersions(t, svc, "alpha\nbeta\n", "alpha\ngamma\n")
	cs := connect(t, svc, false)

	var versions versionsOut
	structured(t, call(t, cs, "list_versions", map[string]any{"path": "/doc"}), &versions)

	res := call(t, cs, "diff_versions", map[string]any{"path": "/doc", "from": versions.Versions[1].Short})
	var out diffOut
	structured(t, res, &out)
	assert.Equal(t, versions.Versions[1].Hash, out.From)
	assert.Equal(t, versions.Versions[0].Hash, out.To, "to defaults to the latest version")
	assert.Equal(t, 1, out.Additions)
	assert.Equal(t, 1, out.Deletions)
	assert.Equal(t, "  alpha\n- beta\n+ gamma", out.Diff, "whole lines of the page text, no front matter")
	assert.Empty(t, out.Changes)
	assert.Contains(t, text(res), "+1 -1 lines")

	requireToolError(t, call(t, cs, "diff_versions", map[string]any{"path": "/doc"}), "from")
}

func TestTools_RestoreVersion(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/target", "Target", "x")
	seedVersions(t, svc, "first [[Target]]", "second")
	cs := connect(t, svc, true)

	var versions versionsOut
	structured(t, call(t, cs, "list_versions", map[string]any{"path": "/doc"}), &versions)
	oldest := versions.Versions[len(versions.Versions)-1]

	var out writeOut
	structured(t, call(t, cs, "restore_version", map[string]any{"path": "/doc", "version": oldest.Short}), &out)
	assert.Contains(t, out.Message, "Restored /doc to "+oldest.Short)

	doc, err := svc.DocumentService.GetDocumentByPath("/doc")
	require.NoError(t, err)
	assert.Equal(t, "first [[Target]]", doc.Content)

	structured(t, call(t, cs, "list_versions", map[string]any{"path": "/doc"}), &versions)
	assert.Len(t, versions.Versions, 3, "a restore is a new version; the old ones stay")

	var links backlinksOut
	structured(t, call(t, cs, "get_backlinks", map[string]any{"path": "/target"}), &links)
	assert.Equal(t, []pageEntry{{Title: "Doc", Path: "/doc"}}, links.Backlinks)

	assert.NotContains(t, toolNames(t, connect(t, svc, false)), "restore_version", "restoring writes")
}

func TestTools_GetOutgoingLinks(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/guides/setup", "Setup", "x")
	seed(t, svc, "/page", "Page", "See [[Setup]], [[Setup|the setup]] and [[Nowhere]].")
	cs := connect(t, svc, false)

	res := call(t, cs, "get_outgoing_links", map[string]any{"path": "/page"})
	var out outgoingOut
	structured(t, res, &out)
	assert.Equal(t, []linkEntry{
		{Target: "Setup", Text: "Setup", Path: "/guides/setup", Exists: true},
		{Target: "Setup", Text: "the setup", Path: "/guides/setup", Exists: true},
		{Target: "Nowhere", Text: "Nowhere", Exists: false},
	}, out.Links)
	assert.Equal(t, 1, out.Broken)
	assert.Contains(t, text(res), "[[Nowhere]] (broken)")

	requireToolError(t, call(t, cs, "get_outgoing_links", map[string]any{"path": "/missing"}), "not found")
}

func TestTools_ListBrokenLinks(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/ok", "Ok", "[[Ok]]")
	seed(t, svc, "/b", "B", "[[Gone]] and [[Also gone]]")
	seed(t, svc, "/a", "A", "[[Gone]]")
	seed(t, svc, "/trash/old", "Old", "[[Gone]]")
	cs := connect(t, svc, false)

	res := call(t, cs, "list_broken_links", nil)
	var out brokenOut
	structured(t, res, &out)
	assert.Equal(t, []brokenPage{
		{Path: "/a", Title: "A", Targets: []string{"Gone"}},
		{Path: "/b", Title: "B", Targets: []string{"Gone", "Also gone"}},
	}, out.Pages, "sorted by path; the trash is skipped")
	assert.Equal(t, 3, out.Total)
	assert.Contains(t, text(res), "3 broken links on 2 pages")
}

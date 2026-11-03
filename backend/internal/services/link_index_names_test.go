package services_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/models"
)

func createWithProperties(t *testing.T, ds interface {
	CreateDocument(*models.Document) error
}, path, title, content string, properties map[string]any) {
	t.Helper()
	require.NoError(t, ds.CreateDocument(&models.Document{
		MetaData: &models.DocumentMetaData{Title: title, Path: path, Properties: properties},
		Content:  content,
	}))
}

// [[name]] finds a page by its file name (the last path segment), as in
// Obsidian, and by its aliases, when the title and the root slug don't match.
func TestLinkIndex_ResolvesFileNamesAndAliases(t *testing.T) {
	ds, ls, _ := newIndexedWiki(t)
	mustCreate(t, ds, "/lab/devices/router", "router — main gateway", "x")
	mustCreate(t, ds, "/a/readme", "Readme A", "x")
	mustCreate(t, ds, "/b/readme", "Readme B", "x")
	mustCreate(t, ds, "/guide", "Guide", "x")
	mustCreate(t, ds, "/docs/guide", "Nested guide", "x")
	mustCreate(t, ds, "/notes/plan", "Plan", "x")
	createWithProperties(t, ds, "/lab/devices/switch", "Core switch", "x",
		map[string]any{"aliases": []any{"core", "Backbone"}})
	createWithProperties(t, ds, "/lab/devices/ap", "Access point", "x",
		map[string]any{"aliases": "wifi"})
	createWithProperties(t, ds, "/lab/old-ap", "Old access point", "x",
		map[string]any{"aliases": []any{"wifi"}})
	mustCreate(t, ds, "/home", "Home",
		"[[router]] [[ROUTER]] [[readme]] [[guide]] [[Plan]] [[core]] [[backbone]] [[wifi]] [[nowhere]]")

	links, err := ls.GetOutgoingLinks("/home")
	require.NoError(t, err)
	got := map[string]string{}
	for _, link := range links {
		if link.IsValid {
			got[link.Target] = link.Path
		} else {
			got[link.Target] = "unresolved"
		}
	}
	assert.Equal(t, map[string]string{
		"router":   "/lab/devices/router", // file name, case-insensitive
		"ROUTER":   "/lab/devices/router",
		"readme":   "unresolved", // two pages share the name
		"guide":    "/guide",     // the root page still wins
		"Plan":     "/notes/plan",
		"core":     "/lab/devices/switch", // alias
		"backbone": "/lab/devices/switch",
		"wifi":     "unresolved", // two pages share the alias
		"nowhere":  "unresolved",
	}, got)
	assert.Equal(t, []string{"/home"}, backlinksOf(t, ls, "/lab/devices/router"))
	assert.Equal(t, []string{"/home"}, backlinksOf(t, ls, "/lab/devices/switch"))
}

// A link left unresolved by one import batch resolves once a later batch
// brings the note: pages live at their file name.
func TestLinkIndex_LinksBetweenImportBatches(t *testing.T) {
	ds, ls, _ := newIndexedWiki(t)
	options := func() *models.ImportOptions { return &models.ImportOptions{TargetPath: "/lab"} }

	_, err := ds.ImportFiles(importFiles(map[string]string{
		"devices/router.md": "# router — main gateway\n\nUplink to [[switch]].",
	}), options())
	require.NoError(t, err)
	assert.False(t, outgoing(t, ls, "/lab/devices/router")["switch"])

	_, err = ds.ImportFiles(importFiles(map[string]string{
		"devices/switch.md": "# switch — core\n\nBack to [[router]].",
	}), options())
	require.NoError(t, err)

	assert.True(t, outgoing(t, ls, "/lab/devices/router")["switch"], "the earlier batch's link resolves now")
	assert.Equal(t, []string{"/lab/devices/router"}, backlinksOf(t, ls, "/lab/devices/switch"))
	assert.Equal(t, []string{"/lab/devices/switch"}, backlinksOf(t, ls, "/lab/devices/router"))
}

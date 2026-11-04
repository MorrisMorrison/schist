package services_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
)

func resolvedTargets(t *testing.T, ls *services.LinkService, path string) map[string]string {
	t.Helper()
	links, err := ls.GetOutgoingLinks(path)
	require.NoError(t, err)
	got := map[string]string{}
	for _, link := range links {
		if link.IsValid {
			got[link.Target] = link.Path
		} else {
			got[link.Target] = "unresolved"
		}
	}
	return got
}

// #333: a title two pages share is ambiguous, like a shared alias or page
// name, so a link by it picks neither page. A path link picks exactly one.
func TestLinkIndex_DuplicateTitlesAndPathLinks(t *testing.T) {
	ds, ls, _ := newIndexedWiki(t)
	mustCreate(t, ds, "/one/overview", "Overview", "x")
	mustCreate(t, ds, "/two/overview", "Overview", "x")
	mustCreate(t, ds, "/two/Setup-Notes", "Setup", "x")
	mustCreate(t, ds, "/plan", "Plan", "x")
	mustCreate(t, ds, "/home", "Home",
		"[[Overview]] [[/one/overview]] [[two/overview]] [[Two/Overview.md|second]] [[two/setup-notes]] [[Plan]] [[/nowhere/page]]")

	assert.Equal(t, map[string]string{
		"Overview":        "unresolved", // two pages have this title
		"/one/overview":   "/one/overview",
		"two/overview":    "/two/overview",
		"Two/Overview.md": "/two/overview",
		"two/setup-notes": "/two/Setup-Notes",
		"Plan":            "/plan",
		"/nowhere/page":   "unresolved",
	}, resolvedTargets(t, ls, "/home"))
	assert.Equal(t, []string{"/home"}, backlinksOf(t, ls, "/one/overview"))
	assert.Equal(t, []string{"/home"}, backlinksOf(t, ls, "/two/overview"))
}

// #333: the same folder imported twice links within each copy, never across.
func TestImport_SameFolderTwiceLinksWithinEachCopy(t *testing.T) {
	ds, ls, _ := newIndexedWiki(t)
	vault := func() []models.ImportFile {
		return importFiles(map[string]string{
			"router.md": "# Router\n\nUplink to [[switch|the switch]].",
			"switch.md": "# Core switch\n\nBack to [[router]].",
		})
	}
	_, err := ds.ImportFiles(vault(), &models.ImportOptions{TargetPath: "/first"})
	require.NoError(t, err)
	_, err = ds.ImportFiles(vault(), &models.ImportOptions{TargetPath: "/second"})
	require.NoError(t, err)

	for _, copy := range []string{"/first", "/second"} {
		router := resolvedTargets(t, ls, copy+"/router")
		require.Len(t, router, 1, copy)
		for _, path := range router {
			assert.Equal(t, copy+"/switch", path, "%s/router links to its own switch", copy)
		}
		assert.Equal(t, []string{copy + "/router"}, backlinksOf(t, ls, copy+"/switch"), copy)
		assert.Equal(t, []string{copy + "/switch"}, backlinksOf(t, ls, copy+"/router"), copy)
	}

	second, err := ds.GetDocumentByPath("/second/router")
	require.NoError(t, err)
	assert.Contains(t, second.Content, "|the switch]]", "the link text stays as written")
}

// A shared title resolves to the page in the nearest folder, if only one is
// nearest: [[Overview]] in /one/plan is /one/overview.
func TestLinkIndex_SharedTitleResolvesToTheNearestPage(t *testing.T) {
	ds, ls, _ := newIndexedWiki(t)
	mustCreate(t, ds, "/one/overview", "Overview", "x")
	mustCreate(t, ds, "/two/overview", "Overview", "x")
	mustCreate(t, ds, "/one/deep/plan", "Plan one", "[[Overview]]")
	mustCreate(t, ds, "/two/plan", "Plan two", "[[overview]]")
	mustCreate(t, ds, "/three/plan", "Plan three", "[[Overview]]")

	assert.Equal(t, map[string]string{"Overview": "/one/overview"}, resolvedTargets(t, ls, "/one/deep/plan"))
	assert.Equal(t, map[string]string{"overview": "/two/overview"}, resolvedTargets(t, ls, "/two/plan"))
	assert.Equal(t, map[string]string{"Overview": "unresolved"}, resolvedTargets(t, ls, "/three/plan"))
	assert.Equal(t, []string{"/one/deep/plan"}, backlinksOf(t, ls, "/one/overview"))

	broken, err := ls.GetBrokenLinks()
	require.NoError(t, err)
	assert.Contains(t, broken, "/three/plan")
	assert.NotContains(t, broken, "/one/deep/plan")
}

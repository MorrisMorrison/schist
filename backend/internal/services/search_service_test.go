package services_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newSearchService(t *testing.T) (*services.SearchService, *services.DocumentService, string) {
	t.Helper()
	dir := t.TempDir()
	ds := setupDocumentService(t, dir)
	return services.NewSearchService(ds, services.NewIgnoreService(dir)), ds, dir
}

func createTagged(t *testing.T, ds *services.DocumentService, path, title, content string, tags ...string) {
	t.Helper()
	require.NoError(t, ds.CreateDocument(&models.Document{
		MetaData: &models.DocumentMetaData{Title: title, Path: path, Tags: tags},
		Content:  content,
	}))
}

// writeRaw writes a document file directly, as another editor or a git pull would.
func writeRaw(t *testing.T, dir, rel, title, body string) string {
	t.Helper()
	path := filepath.Join(dir, filepath.FromSlash(rel))
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	content := fmt.Sprintf("---\ntitle: %s\npath: /%s\n---\n%s\n", title, strings.TrimSuffix(rel, ".md"), body)
	require.NoError(t, os.WriteFile(path, []byte(content), 0o644))
	return path
}

func search(t *testing.T, s *services.SearchService, query string) []services.SearchResult {
	t.Helper()
	results, total, err := s.Search(query, 0)
	require.NoError(t, err)
	require.Equal(t, len(results), total)
	return results
}

func paths(results []services.SearchResult) []string {
	out := make([]string, len(results))
	for i, r := range results {
		out[i] = r.Path
	}
	return out
}

func snippetText(r services.SearchResult) (text string, marked []string) {
	for _, seg := range r.Snippet {
		text += seg.Text
		if seg.Match {
			marked = append(marked, seg.Text)
		}
	}
	return text, marked
}

func TestSearchService_FindsWordsInTheBody(t *testing.T) {
	s, ds, _ := newSearchService(t)
	createTagged(t, ds, "/guides/deploy", "Deployment checklist",
		"# Before you ship\n\nRun the **migrations** first, then roll the [canary](https://example.com).")
	createTagged(t, ds, "/notes/lunch", "Lunch ideas", "Tacos on Tuesday.")

	results := search(t, s, "migrations")
	require.Len(t, results, 1)
	r := results[0]
	assert.Equal(t, "/guides/deploy", r.Path)
	assert.Equal(t, "Deployment checklist", r.Title)
	assert.Equal(t, services.MatchedInContent, r.MatchedIn)
	text, marked := snippetText(r)
	assert.Contains(t, text, "Run the migrations first, then roll the canary.", "markdown is stripped")
	assert.Equal(t, []string{"migrations"}, marked)
}

func TestSearchService_SnippetSkipsATitleHeading(t *testing.T) {
	s, ds, _ := newSearchService(t)
	createTagged(t, ds, "/doc", "Release checklist", "# Release checklist\n\nTag the build.", "ops")

	text, _ := snippetText(search(t, s, "tag:ops")[0])
	assert.Equal(t, "Tag the build.", text)
}

func TestSearchService_EveryWordMustMatchAWordPrefix(t *testing.T) {
	s, ds, _ := newSearchService(t)
	createTagged(t, ds, "/a", "Alpha", "The database migration runbook.")
	createTagged(t, ds, "/b", "Beta", "A database for photos.")

	assert.Equal(t, []string{"/a"}, paths(search(t, s, "database migr")), "all words, prefixes allowed")
	assert.ElementsMatch(t, []string{"/a", "/b"}, paths(search(t, s, "DATA")), "case-insensitive")
	assert.Empty(t, search(t, s, "abase"), "not in the middle of a word")
	assert.Empty(t, search(t, s, "database kittens"))
}

func TestSearchService_RanksTitleAboveHeadingAboveBody(t *testing.T) {
	s, ds, _ := newSearchService(t)
	createTagged(t, ds, "/body", "Notes", "Some words about kubernetes in passing.")
	createTagged(t, ds, "/heading", "Infra", "## Kubernetes\n\nCluster notes.")
	createTagged(t, ds, "/title", "Kubernetes basics", "Pods and services.")
	createTagged(t, ds, "/exact", "Kubernetes", "Overview.")

	results := search(t, s, "kubernetes")
	assert.Equal(t, []string{"/exact", "/title", "/heading", "/body"}, paths(results))
	assert.Equal(t, services.MatchedInTitle, results[1].MatchedIn)
	assert.Equal(t, services.MatchedInHeading, results[2].MatchedIn)
	assert.Equal(t, services.MatchedInContent, results[3].MatchedIn)
}

func TestSearchService_PhraseRanksHigherAndIsHighlighted(t *testing.T) {
	s, ds, _ := newSearchService(t)
	createTagged(t, ds, "/scattered", "One", "The release went out. Later we wrote notes on a problem.")
	createTagged(t, ds, "/phrase", "Two", "Writing the release notes takes time.")

	results := search(t, s, "release notes")
	assert.Equal(t, []string{"/phrase", "/scattered"}, paths(results))
	_, marked := snippetText(results[0])
	assert.Equal(t, []string{"release notes"}, marked, "adjacent hits merge into one mark")
}

func TestSearchService_MatchesTagsAndTagFilters(t *testing.T) {
	s, ds, _ := newSearchService(t)
	createTagged(t, ds, "/go", "Go Programming", "About the Go language.", "programming", "golang")
	createTagged(t, ds, "/py", "Python Guide", "About Python.", "programming", "python")
	createTagged(t, ds, "/db", "Database Design", "Normal forms.", "database")

	assert.ElementsMatch(t, []string{"/go", "/py"}, paths(search(t, s, "tag:programming")))
	assert.Equal(t, []string{"/go"}, paths(search(t, s, "about tag:golang")))
	assert.Equal(t, []string{"/go"}, paths(search(t, s, "tag:programming tag:golang")))

	results := search(t, s, "golang")
	require.Len(t, results, 1, "a plain word also matches tags")
	assert.Equal(t, services.MatchedInTag, results[0].MatchedIn)
}

func TestSearchService_EmptyQueriesMatchNothing(t *testing.T) {
	s, ds, _ := newSearchService(t)
	createTagged(t, ds, "/a", "Alpha", "text")

	for _, q := range []string{"", "   ", "tag:"} {
		assert.Empty(t, search(t, s, q), "query %q", q)
	}
}

func TestSearchService_FuzzyTitleFallback(t *testing.T) {
	s, ds, _ := newSearchService(t)
	createTagged(t, ds, "/gs", "Getting started", "Welcome.")
	createTagged(t, ds, "/word", "Other", "gtst appears literally here.")

	results := search(t, s, "gtst")
	assert.Equal(t, []string{"/word", "/gs"}, paths(results), "a real word match ranks above a fuzzy title one")
	assert.Equal(t, services.MatchedInTitle, results[1].MatchedIn)
}

func TestSearchService_PicksUpChangesMadeOutsideTheApp(t *testing.T) {
	s, _, dir := newSearchService(t)
	file := writeRaw(t, dir, "notes/outside.md", "Outside", "Written by another editor about zeppelins.")

	require.Len(t, search(t, s, "zeppelins"), 1, "new file")

	require.NoError(t, os.WriteFile(file, []byte("---\ntitle: Outside\npath: /notes/outside\n---\nNow about submarines.\n"), 0o644))
	later := time.Now().Add(time.Minute)
	require.NoError(t, os.Chtimes(file, later, later))
	assert.Empty(t, search(t, s, "zeppelins"), "changed file is re-read")
	assert.Len(t, search(t, s, "submarines"), 1)

	require.NoError(t, os.Remove(file))
	assert.Empty(t, search(t, s, "submarines"), "deleted file drops out")
}

func TestSearchService_PicksUpAppEdits(t *testing.T) {
	s, ds, _ := newSearchService(t)
	createTagged(t, ds, "/doc", "Doc", "first version mentions apples")
	require.Len(t, search(t, s, "apples"), 1)

	require.NoError(t, ds.UpdateDocumentWithSaveType(&models.Document{
		MetaData: &models.DocumentMetaData{Title: "Doc", Path: "/doc"},
		Content:  "second version mentions pears and is longer",
	}, "manual"))
	assert.Empty(t, search(t, s, "apples"))
	assert.Len(t, search(t, s, "pears"), 1)
}

func TestSearchService_SkipsIgnoredDirsAndBrokenFiles(t *testing.T) {
	s, ds, dir := newSearchService(t)
	createTagged(t, ds, "/go", "Go Notes", "x", "golang")
	writeRaw(t, dir, "trash/old.md", "Go Old", "go")
	writeRaw(t, dir, ".schist/internal.md", "Go Internal", "go")
	require.NoError(t, os.WriteFile(filepath.Join(dir, "broken.md"), []byte("---\ntitle: [unclosed\n---\ngo"), 0o644))

	assert.Equal(t, []string{"/go"}, paths(search(t, s, "go")))
}

func TestSearchService_LimitKeepsTheTotal(t *testing.T) {
	s, ds, _ := newSearchService(t)
	for i := range 5 {
		createTagged(t, ds, fmt.Sprintf("/doc-%d", i), fmt.Sprintf("Report %d", i), "quarterly numbers")
	}

	results, total, err := s.Search("quarterly", 2)
	require.NoError(t, err)
	assert.Len(t, results, 2)
	assert.Equal(t, 5, total)

	results, _, err = s.Search("quarterly", 10_000)
	require.NoError(t, err)
	assert.Len(t, results, 5, "limit is capped, not an error")
}

// Searches run while files are created, changed and deleted. Run with -race.
func TestSearchService_ConcurrentSearchesAndEdits(t *testing.T) {
	s, ds, dir := newSearchService(t)
	for i := range 10 {
		createTagged(t, ds, fmt.Sprintf("/seed-%d", i), fmt.Sprintf("Seed %d", i), "common text")
	}

	var wg sync.WaitGroup
	for w := range 4 {
		wg.Add(2)
		go func() {
			defer wg.Done()
			for range 25 {
				_, _, err := s.Search("common", 0)
				assert.NoError(t, err)
			}
		}()
		go func(w int) {
			defer wg.Done()
			for i := range 10 {
				file := writeRaw(t, dir, fmt.Sprintf("w%d/n%d.md", w, i), "Worker note", "common churn")
				if i%2 == 0 {
					assert.NoError(t, os.Remove(file))
				}
			}
		}(w)
	}
	wg.Wait()

	assert.Len(t, search(t, s, "churn"), 4*5, "the index settles on what is on disk")
}

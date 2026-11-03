package services

import (
	"log"
	"os"
	"path"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/MorrisMorrison/schist/internal/serializer"
	"github.com/MorrisMorrison/schist/internal/utils"
)

// linkIndex keeps every document's title and wiki link targets in memory, so
// backlinks, outgoing links and link resolution are lookups instead of a read
// of the whole wiki per request.
//
// Like the search index, each use brings it up to date by stat-ing the data
// dir and re-reading only files whose size or modification time changed (or
// that a caller marked as changed). That covers the app's own writes (create,
// update, move, delete, folder operations, import) and edits made outside the
// app, without hooks in every write path or a file watcher.
type linkIndex struct {
	documents     *DocumentService
	ignoreService *IgnoreService

	mu      sync.Mutex
	entries map[string]*linkEntry // logical path -> entry
	stale   map[string]bool       // paths to re-read on the next refresh

	// Derived from entries; rebuilt after a refresh that changed anything.
	derivedValid bool
	resolver     *linkResolver
	backlinks    map[string][]string // target path -> sorted source paths
}

type linkEntry struct {
	path    string
	title   string
	aliases []string // from the aliases property
	links   []linkTarget
	ignored bool // listed, but never a link source
	order   int  // position in the last walk; the first of two equal titles wins
	modTime time.Time
	size    int64
}

// linkTarget is one [[target|display]] occurrence, before resolution.
type linkTarget struct {
	target  string
	display string
}

func newLinkIndex(documents *DocumentService, ignoreService *IgnoreService) *linkIndex {
	return &linkIndex{
		documents:     documents,
		ignoreService: ignoreService,
		entries:       map[string]*linkEntry{},
		stale:         map[string]bool{},
	}
}

// markStale makes the next refresh re-read paths even if their size and
// modification time look unchanged (a same-size save within the clock's
// resolution).
func (x *linkIndex) markStale(paths ...string) {
	x.mu.Lock()
	defer x.mu.Unlock()
	for _, path := range paths {
		x.stale[path] = true
	}
}

// refresh brings the index in line with the files on disk and rebuilds the
// derived maps if anything changed. Callers hold mu.
func (x *linkIndex) refresh() error {
	seen := make(map[string]bool, len(x.entries))
	changed := false
	order := 0

	err := x.documents.walkDocumentFiles(func(fsPath, logicalPath string, dirEntry os.DirEntry) error {
		info, err := dirEntry.Info()
		if err != nil {
			return nil // removed while walking
		}
		seen[logicalPath] = true
		order++

		existing := x.entries[logicalPath]
		if existing != nil && !x.stale[logicalPath] &&
			existing.size == info.Size() && existing.modTime.Equal(info.ModTime()) {
			if existing.order != order {
				existing.order = order
				changed = true
			}
			return nil
		}

		changed = true
		entry, err := x.buildEntry(fsPath, logicalPath)
		if err != nil {
			// Unreadable or mid-write: leave it out and retry next time.
			log.Printf("[LinkIndex] skipping %s: %v", logicalPath, err)
			delete(x.entries, logicalPath)
			return nil
		}
		entry.order, entry.modTime, entry.size = order, info.ModTime(), info.Size()
		x.entries[logicalPath] = entry
		return nil
	})
	if err != nil {
		return err
	}
	clear(x.stale)

	for path := range x.entries {
		if !seen[path] {
			delete(x.entries, path)
			changed = true
		}
	}

	if changed || !x.derivedValid {
		x.rebuildDerived()
	}
	return nil
}

func (x *linkIndex) buildEntry(fsPath, logicalPath string) (*linkEntry, error) {
	raw, err := os.ReadFile(fsPath)
	if err != nil {
		return nil, err
	}
	document, err := serializer.DeserializeDocument(raw)
	if err != nil {
		return nil, err
	}
	return &linkEntry{
		// The front matter path is what links have always resolved to.
		path:    document.MetaData.Path,
		title:   document.MetaData.Title,
		aliases: propertyStrings(document.MetaData.Properties["aliases"]),
		links:   extractLinkTargets(document.Content),
		ignored: x.ignoreService.ShouldIgnore(logicalPath),
	}, nil
}

// rebuildDerived recomputes the resolver and the backlinks from the entries.
// It only touches memory. Callers hold mu.
func (x *linkIndex) rebuildDerived() {
	ordered := make([]*linkEntry, 0, len(x.entries))
	for _, entry := range x.entries {
		ordered = append(ordered, entry)
	}
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].order < ordered[j].order })

	resolver := &linkResolver{
		byTitle: map[string]string{},
		byAlias: map[string]string{},
		byBase:  map[string]string{},
		paths:   map[string]bool{},
	}
	for _, entry := range ordered {
		resolver.paths[entry.path] = true
		key := strings.ToLower(entry.title)
		if _, taken := resolver.byTitle[key]; !taken {
			resolver.byTitle[key] = entry.path
		}
		for _, alias := range entry.aliases {
			addUnique(resolver.byAlias, strings.ToLower(alias), entry.path)
		}
		addUnique(resolver.byBase, path.Base(entry.path), entry.path)
	}

	backlinks := map[string][]string{}
	for _, entry := range ordered {
		if entry.ignored {
			continue
		}
		for _, link := range entry.links {
			if path, ok := resolver.resolve(link.target); ok {
				addBacklink(backlinks, path, entry.path)
			}
		}
	}
	for _, sources := range backlinks {
		slices.Sort(sources)
	}

	x.resolver, x.backlinks, x.derivedValid = resolver, backlinks, true
}

// withFresh runs fn on the up-to-date index while holding the lock.
func (x *linkIndex) withFresh(fn func() error) error {
	x.mu.Lock()
	defer x.mu.Unlock()
	if err := x.refresh(); err != nil {
		return err
	}
	return fn()
}

// entryAt returns the entry whose document lives at path. Callers hold mu.
func (x *linkIndex) entryAt(path string) *linkEntry {
	if entry := x.entries[path]; entry != nil && entry.path == path {
		return entry
	}
	// The file name and the front matter path normally agree; when they
	// don't, the front matter path is the document's path.
	for _, entry := range x.entries {
		if entry.path == path {
			return entry
		}
	}
	return nil
}

// extractLinkTargets returns the wiki links in content, unresolved.
func extractLinkTargets(content string) []linkTarget {
	var links []linkTarget
	for _, match := range wikiLinkRegex.FindAllStringSubmatch(content, -1) {
		if len(match) < 2 {
			continue
		}

		// In a table cell the alias pipe is escaped: [[Title\|alias]].
		target := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(match[1]), `\`))
		if target == "" {
			continue
		}

		display := target
		if len(match) > 2 && match[2] != "" {
			display = strings.TrimSpace(match[2])
		}
		links = append(links, linkTarget{target: target, display: display})
	}
	return links
}

// linkResolver maps link targets to document paths.
type linkResolver struct {
	byTitle map[string]string // lower-cased title -> path
	byAlias map[string]string // lower-cased alias -> path, or ambiguousName
	byBase  map[string]string // page name (last path segment) -> path, or ambiguousName
	paths   map[string]bool
}

// ambiguousName marks an alias or page name that more than one page has; a
// link by it stays unresolved rather than picking one at random.
const ambiguousName = ""

func addUnique(names map[string]string, name, pagePath string) {
	if name == "" {
		return
	}
	if existing, taken := names[name]; taken && existing != pagePath {
		names[name] = ambiguousName
		return
	}
	names[name] = pagePath
}

// propertyStrings reads a property that holds one string or a list of them
// (Obsidian writes aliases either way).
func propertyStrings(value any) []string {
	var out []string
	switch v := value.(type) {
	case string:
		out = append(out, v)
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
	}
	for i := range out {
		out[i] = strings.TrimSpace(out[i])
	}
	return out
}

// resolve returns the path a link target points to and whether a document
// exists there: by title, then the page at the root slug, then a page's alias,
// then a page's name (the last segment of its path, which is an imported
// note's file name). It never touches the disk.
func (r *linkResolver) resolve(target string) (string, bool) {
	if path, ok := r.byTitle[strings.ToLower(target)]; ok {
		return path, true
	}
	slug := utils.GenerateSlug(target)
	rootPath := "/" + slug
	if r.paths[rootPath] {
		return rootPath, true
	}
	if path := r.byAlias[strings.ToLower(strings.TrimSpace(target))]; path != ambiguousName {
		return path, true
	}
	if path := r.byBase[slug]; path != ambiguousName {
		return path, true
	}
	return rootPath, false
}

func (r *linkResolver) resolveAll(links []linkTarget) []*WikiLink {
	resolved := make([]*WikiLink, 0, len(links))
	for _, link := range links {
		path, valid := r.resolve(link.target)
		resolved = append(resolved, &WikiLink{
			Target:      link.target,
			DisplayText: link.display,
			Path:        path,
			IsValid:     valid,
		})
	}
	return resolved
}

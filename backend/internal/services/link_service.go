package services

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
	"sync"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/utils"
)

type WikiLink struct {
	Target      string `json:"target"`
	DisplayText string `json:"display_text"`
	Path        string `json:"path"`
	IsValid     bool   `json:"is_valid"`
}

type LinkService struct {
	documentService *DocumentService
	ignoreService   *IgnoreService

	// mu guards backlinks: handlers update and rebuild the index from
	// concurrent requests, and an unguarded map write is a fatal runtime
	// error that takes down the whole server.
	mu        sync.Mutex
	backlinks map[string][]string // map[targetPath][]sourcePaths
}

func NewLinkService(documentService *DocumentService, ignoreService *IgnoreService) *LinkService {
	return &LinkService{
		documentService: documentService,
		ignoreService:   ignoreService,
		backlinks:       make(map[string][]string),
	}
}

var wikiLinkRegex = regexp.MustCompile(`\[\[([^\]|]+)(?:\|([^\]]+))?\]\]`)

// ParseWikiLinks returns the wiki links in content, resolved against the
// current documents.
func (l *LinkService) ParseWikiLinks(content string) []*WikiLink {
	return parseWikiLinks(content, l.newLinkResolver(nil))
}

func parseWikiLinks(content string, resolver *linkResolver) []*WikiLink {
	matches := wikiLinkRegex.FindAllStringSubmatch(content, -1)
	var links []*WikiLink

	for _, match := range matches {
		if len(match) < 2 {
			continue
		}

		// In a table cell the alias pipe is escaped: [[Title\|alias]].
		target := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(match[1]), `\`))
		if target == "" {
			continue
		}

		displayText := target
		if len(match) > 2 && match[2] != "" {
			displayText = strings.TrimSpace(match[2])
		}

		path, isValid := resolver.resolve(target)

		links = append(links, &WikiLink{
			Target:      target,
			DisplayText: displayText,
			Path:        path,
			IsValid:     isValid,
		})
	}

	return links
}

func (l *LinkService) resolveTargetToPath(target string) string {
	path, _ := l.newLinkResolver(nil).resolve(target)
	return path
}

// linkResolver maps link targets to document paths from one listing of the
// documents. Resolving each link by listing every document again made
// importing or indexing a wiki with many links take seconds per page.
type linkResolver struct {
	l       *LinkService
	byTitle map[string]string // lower-cased title -> path
	paths   map[string]bool
}

// newLinkResolver builds a resolver from documents, or from a fresh listing
// when documents is nil.
func (l *LinkService) newLinkResolver(documents []*models.Document) *linkResolver {
	if documents == nil {
		documents, _ = l.documentService.ListDocuments()
	}
	r := &linkResolver{l: l, byTitle: map[string]string{}, paths: map[string]bool{}}
	for _, document := range documents {
		r.paths[document.MetaData.Path] = true
		key := strings.ToLower(document.MetaData.Title)
		if _, taken := r.byTitle[key]; !taken {
			r.byTitle[key] = document.MetaData.Path
		}
	}
	return r
}

// resolve returns the path a link target points to (by title, else by slug)
// and whether a document exists there.
func (r *linkResolver) resolve(target string) (string, bool) {
	if path, ok := r.byTitle[strings.ToLower(target)]; ok {
		return path, true
	}
	path := "/" + utils.GenerateSlug(target)
	if r.paths[path] {
		return path, true
	}
	// Not in the listing (e.g. an ignored folder): check the file itself.
	return path, r.l.documentExists(path)
}

func (l *LinkService) documentExists(path string) bool {
	_, err := l.documentService.GetDocumentByPath(path)
	return err == nil
}

func (l *LinkService) GetOutgoingLinks(pagePath string) ([]*WikiLink, error) {
	page, err := l.documentService.GetDocumentByPath(pagePath)
	if err != nil {
		return nil, fmt.Errorf("failed to get page: %w", err)
	}

	return l.ParseWikiLinks(page.Content), nil
}

func (l *LinkService) GetBacklinks(targetPath string) ([]string, error) {
	if err := utils.ValidatePath(targetPath); err != nil {
		return nil, fmt.Errorf("invalid target path: %w", err)
	}

	index, err := l.buildBacklinksIndex()
	if err != nil {
		return nil, fmt.Errorf("failed to rebuild backlinks index: %w", err)
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	l.backlinks = index

	backlinks := l.backlinks[targetPath]
	if backlinks == nil {
		return []string{}, nil
	}

	result := make([]string, len(backlinks))
	copy(result, backlinks)
	return result, nil
}

func (l *LinkService) UpdateBacklinks(pagePath string) error {
	return l.UpdateBacklinksFor(pagePath)
}

// UpdateBacklinksFor refreshes the backlinks contributed by each page, with
// one listing of the documents for all of them (an import passes every new
// page at once). The first error is returned after all pages are tried.
func (l *LinkService) UpdateBacklinksFor(pagePaths ...string) error {
	resolver := l.newLinkResolver(nil)
	var firstErr error
	for _, pagePath := range pagePaths {
		if err := l.updateBacklinks(pagePath, resolver); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (l *LinkService) updateBacklinks(pagePath string, resolver *linkResolver) error {
	if err := utils.ValidatePath(pagePath); err != nil {
		return fmt.Errorf("invalid page path: %w", err)
	}

	page, err := l.documentService.GetDocumentByPath(pagePath)
	var links []*WikiLink
	if err == nil {
		links = parseWikiLinks(page.Content, resolver)
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	l.removeBacklinksFromSource(pagePath)
	if err != nil {
		return fmt.Errorf("failed to get outgoing links: failed to get page: %w", err)
	}

	for _, link := range links {
		if link.IsValid {
			addBacklink(l.backlinks, link.Path, pagePath)
		}
	}

	return nil
}

// removeBacklinksFromSource drops every backlink contributed by sourcePath.
// Callers must hold l.mu.
func (l *LinkService) removeBacklinksFromSource(sourcePath string) {
	for targetPath, sources := range l.backlinks {
		var newSources []string
		for _, source := range sources {
			if source != sourcePath {
				newSources = append(newSources, source)
			}
		}

		if len(newSources) == 0 {
			delete(l.backlinks, targetPath)
		} else {
			l.backlinks[targetPath] = newSources
		}
	}
}

func addBacklink(index map[string][]string, targetPath, sourcePath string) {
	if slices.Contains(index[targetPath], sourcePath) {
		return
	}
	index[targetPath] = append(index[targetPath], sourcePath)
}

// buildBacklinksIndex computes a fresh backlinks index from all documents.
// It does not touch l.backlinks, so it runs without holding l.mu.
func (l *LinkService) buildBacklinksIndex() (map[string][]string, error) {
	index := make(map[string][]string)

	documents, err := l.documentService.ListDocuments()
	if err != nil {
		return nil, fmt.Errorf("failed to list documents: %w", err)
	}

	resolver := l.newLinkResolver(documents)
	for _, document := range documents {
		if l.ignoreService.ShouldIgnore(document.MetaData.Path) {
			continue
		}

		links := parseWikiLinks(document.Content, resolver)
		for _, link := range links {
			if link.IsValid {
				addBacklink(index, link.Path, document.MetaData.Path)
			}
		}
	}

	return index, nil
}

func (l *LinkService) GetBrokenLinks() (map[string][]*WikiLink, error) {
	pages, err := l.documentService.ListDocuments()
	if err != nil {
		return nil, fmt.Errorf("failed to list pages: %w", err)
	}

	brokenLinks := make(map[string][]*WikiLink)

	resolver := l.newLinkResolver(pages)
	for _, page := range pages {
		if l.ignoreService.ShouldIgnore(page.MetaData.Path) {
			continue
		}

		links := parseWikiLinks(page.Content, resolver)
		var broken []*WikiLink

		for _, link := range links {
			if !link.IsValid {
				broken = append(broken, link)
			}
		}

		if len(broken) > 0 {
			brokenLinks[page.MetaData.Path] = broken
		}
	}

	return brokenLinks, nil
}

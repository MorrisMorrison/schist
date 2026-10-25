package services

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
	"sync"

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

func (l *LinkService) ParseWikiLinks(content string) []*WikiLink {
	matches := wikiLinkRegex.FindAllStringSubmatch(content, -1)
	var links []*WikiLink

	for _, match := range matches {
		if len(match) < 2 {
			continue
		}

		target := strings.TrimSpace(match[1])
		if target == "" {
			continue
		}

		displayText := target
		if len(match) > 2 && match[2] != "" {
			displayText = strings.TrimSpace(match[2])
		}

		path := l.resolveTargetToPath(target)

		isValid := l.documentExists(path)

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
	if path := l.findDocumentByTitle(target); path != "" {
		return path
	}

	slug := utils.GenerateSlug(target)
	return "/" + slug
}

func (l *LinkService) findDocumentByTitle(title string) string {
	documents, err := l.documentService.ListDocuments()
	if err != nil {
		return ""
	}

	lowerTitle := strings.ToLower(title)
	for _, document := range documents {
		if strings.ToLower(document.MetaData.Title) == lowerTitle {
			return document.MetaData.Path
		}
	}

	return ""
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
	if err := utils.ValidatePath(pagePath); err != nil {
		return fmt.Errorf("invalid page path: %w", err)
	}

	links, err := l.GetOutgoingLinks(pagePath)

	l.mu.Lock()
	defer l.mu.Unlock()

	l.removeBacklinksFromSource(pagePath)
	if err != nil {
		return fmt.Errorf("failed to get outgoing links: %w", err)
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

	for _, document := range documents {
		if l.ignoreService.ShouldIgnore(document.MetaData.Path) {
			continue
		}

		links := l.ParseWikiLinks(document.Content)
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

	for _, page := range pages {
		if l.ignoreService.ShouldIgnore(page.MetaData.Path) {
			continue
		}

		links := l.ParseWikiLinks(page.Content)
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

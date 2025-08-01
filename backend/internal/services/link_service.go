package services

import (
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/MorrisMorrison/schist/internal/utils"
)

// WikiLink represents a link found in document content
type WikiLink struct {
	Target      string `json:"target"`       // The target document title/name
	DisplayText string `json:"display_text"` // Text to display (if different from target)
	Path        string `json:"path"`         // Resolved path to target document
	IsValid     bool   `json:"is_valid"`     // Whether the target document exists
}

// LinkService handles wiki link parsing and backlink tracking
type LinkService struct {
	documentService *DocumentService
	backlinks       map[string][]string // map[targetPath][]sourcePaths
}

// NewLinkService creates a new link service
func NewLinkService(documentService *DocumentService) *LinkService {
	return &LinkService{
		documentService: documentService,
		backlinks:       make(map[string][]string),
	}
}

// wikiLinkRegex matches [[Document Name]] and [[Document Name|Display Text]] patterns
var wikiLinkRegex = regexp.MustCompile(`\[\[([^\]|]+)(?:\|([^\]]+))?\]\]`)

// ParseWikiLinks extracts all wiki links from document content
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

		// Resolve target to path
		path := l.resolveTargetToPath(target)

		// Check if target document exists
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

// resolveTargetToPath converts a document title to a path
func (l *LinkService) resolveTargetToPath(target string) string {
	// First try to find exact title match
	if path := l.findDocumentByTitle(target); path != "" {
		return path
	}

	// If no exact match, generate slug-based path
	slug := utils.GenerateSlug(target)
	return "/" + slug
}

// findDocumentByTitle searches for a document with the exact title
func (l *LinkService) findDocumentByTitle(title string) string {
	documents, err := l.documentService.ListDocuments()
	if err != nil {
		return ""
	}

	// Case-insensitive title matching
	lowerTitle := strings.ToLower(title)
	for _, document := range documents {
		if strings.ToLower(document.MetaData.Title) == lowerTitle {
			return document.MetaData.Path
		}
	}

	return ""
}

// documentExists checks if a document exists at the given path
func (l *LinkService) documentExists(path string) bool {
	_, err := l.documentService.GetDocumentByPath(path)
	return err == nil
}

// GetOutgoingLinks returns all outgoing links for a page
func (l *LinkService) GetOutgoingLinks(pagePath string) ([]*WikiLink, error) {
	page, err := l.documentService.GetDocumentByPath(pagePath)
	if err != nil {
		return nil, fmt.Errorf("failed to get page: %w", err)
	}

	return l.ParseWikiLinks(page.Content), nil
}

// GetBacklinks returns all pages that link to the given page
func (l *LinkService) GetBacklinks(targetPath string) ([]string, error) {
	if err := utils.ValidatePath(targetPath); err != nil {
		return nil, fmt.Errorf("invalid target path: %w", err)
	}

	// Rebuild backlinks index if needed
	if err := l.rebuildBacklinksIndex(); err != nil {
		return nil, fmt.Errorf("failed to rebuild backlinks index: %w", err)
	}

	backlinks := l.backlinks[targetPath]
	if backlinks == nil {
		return []string{}, nil
	}

	// Return a copy to prevent external modification
	result := make([]string, len(backlinks))
	copy(result, backlinks)
	return result, nil
}

// UpdateBacklinks updates the backlinks index for a specific page
func (l *LinkService) UpdateBacklinks(pagePath string) error {
	if err := utils.ValidatePath(pagePath); err != nil {
		return fmt.Errorf("invalid page path: %w", err)
	}

	// Remove old backlinks for this page
	l.removeBacklinksFromSource(pagePath)

	// Get current outgoing links
	links, err := l.GetOutgoingLinks(pagePath)
	if err != nil {
		return fmt.Errorf("failed to get outgoing links: %w", err)
	}

	// Add new backlinks
	for _, link := range links {
		if link.IsValid {
			l.addBacklink(link.Path, pagePath)
		}
	}

	return nil
}

// removeBacklinksFromSource removes all backlinks originating from the given source page
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

// addBacklink adds a backlink relationship
func (l *LinkService) addBacklink(targetPath, sourcePath string) {
	if l.backlinks[targetPath] == nil {
		l.backlinks[targetPath] = []string{}
	}

	// Check if backlink already exists
	if slices.Contains(l.backlinks[targetPath], sourcePath) {
		return // Already exists
	}

	l.backlinks[targetPath] = append(l.backlinks[targetPath], sourcePath)
}

// rebuildBacklinksIndex rebuilds the entire backlinks index
func (l *LinkService) rebuildBacklinksIndex() error {
	// Clear existing index
	l.backlinks = make(map[string][]string)

	documents, err := l.documentService.ListDocuments()
	if err != nil {
		return fmt.Errorf("failed to list documents: %w", err)
	}

	// Process each document
	for _, document := range documents {
		// Skip trash documents
		if strings.Contains(document.MetaData.Path, "/trash") {
			continue
		}

		links := l.ParseWikiLinks(document.Content)
		for _, link := range links {
			if link.IsValid {
				l.addBacklink(link.Path, document.MetaData.Path)
			}
		}
	}

	return nil
}

// GetBrokenLinks returns all broken links across all pages
func (l *LinkService) GetBrokenLinks() (map[string][]*WikiLink, error) {
	pages, err := l.documentService.ListDocuments()
	if err != nil {
		return nil, fmt.Errorf("failed to list pages: %w", err)
	}

	brokenLinks := make(map[string][]*WikiLink)

	for _, page := range pages {
		// Skip trash pages
		if strings.Contains(page.MetaData.Path, "/trash") {
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

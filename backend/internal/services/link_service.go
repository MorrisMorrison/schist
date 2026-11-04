package services

import (
	"fmt"
	"regexp"
	"slices"

	"github.com/MorrisMorrison/schist/internal/utils"
)

type WikiLink struct {
	Target      string `json:"target"`
	DisplayText string `json:"display_text"`
	Path        string `json:"path"`
	IsValid     bool   `json:"is_valid"`
}

// LinkService answers wiki link questions (outgoing links, backlinks, broken
// links) from an in-memory link index that follows the files on disk.
type LinkService struct {
	documentService *DocumentService
	index           *linkIndex
}

func NewLinkService(documentService *DocumentService, ignoreService *IgnoreService) *LinkService {
	return &LinkService{
		documentService: documentService,
		index:           newLinkIndex(documentService, ignoreService),
	}
}

var wikiLinkRegex = regexp.MustCompile(`\[\[([^\]|]+)(?:\|([^\]]+))?\]\]`)

// ParseWikiLinks returns the wiki links in content, resolved against the
// current documents.
func (l *LinkService) ParseWikiLinks(content string) []*WikiLink {
	var links []*WikiLink
	if err := l.index.withFresh(func() error {
		links = l.index.resolver.resolveAll(extractLinkTargets(content), "")
		return nil
	}); err != nil {
		return resolverOfNothing().resolveAll(extractLinkTargets(content), "")
	}
	return links
}

// resolverOfNothing resolves every link as missing; used when the data dir
// can't be read at all.
func resolverOfNothing() *linkResolver {
	return &linkResolver{byTitle: map[string]string{}, paths: map[string]bool{}}
}

func (l *LinkService) resolveTargetToPath(target string) string {
	links := l.ParseWikiLinks("[[" + target + "]]")
	if len(links) == 0 {
		return "/" + utils.GenerateSlug(target)
	}
	return links[0].Path
}

func (l *LinkService) GetOutgoingLinks(pagePath string) ([]*WikiLink, error) {
	if err := utils.ValidatePath(pagePath); err != nil {
		return nil, fmt.Errorf("invalid page path: %w", err)
	}

	var links []*WikiLink
	err := l.index.withFresh(func() error {
		if entry := l.index.entryAt(pagePath); entry != nil {
			links = l.index.resolver.resolveAll(entry.links, entry.path)
			return nil
		}
		// Not indexed (ignored or unreadable): read it to report why.
		page, err := l.documentService.GetDocumentByPath(pagePath)
		if err != nil {
			return fmt.Errorf("failed to get page: %w", err)
		}
		links = l.index.resolver.resolveAll(extractLinkTargets(page.Content), pagePath)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return links, nil
}

func (l *LinkService) GetBacklinks(targetPath string) ([]string, error) {
	if err := utils.ValidatePath(targetPath); err != nil {
		return nil, fmt.Errorf("invalid target path: %w", err)
	}

	var result []string
	err := l.index.withFresh(func() error {
		result = slices.Clone(l.index.backlinks[targetPath])
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to refresh the link index: %w", err)
	}
	if result == nil {
		result = []string{}
	}
	return result, nil
}

func (l *LinkService) UpdateBacklinks(pagePath string) error {
	return l.UpdateBacklinksFor(pagePath)
}

// UpdateBacklinksFor tells the index that these pages changed. The index
// notices changed files by itself; this also catches a save that kept the
// file's size and modification time. It returns an error for an invalid path
// or a page that no longer exists, after updating all the others.
func (l *LinkService) UpdateBacklinksFor(pagePaths ...string) error {
	var firstErr error
	valid := make([]string, 0, len(pagePaths))
	for _, pagePath := range pagePaths {
		if err := utils.ValidatePath(pagePath); err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("invalid page path: %w", err)
			}
			continue
		}
		valid = append(valid, pagePath)
	}
	l.index.markStale(valid...)

	err := l.index.withFresh(func() error {
		for _, pagePath := range valid {
			if l.index.entryAt(pagePath) == nil && firstErr == nil {
				_, err := l.documentService.GetDocumentByPath(pagePath)
				if err == nil {
					continue // exists but isn't indexed (ignored)
				}
				firstErr = fmt.Errorf("failed to get outgoing links: failed to get page: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return firstErr
}

func addBacklink(index map[string][]string, targetPath, sourcePath string) {
	if slices.Contains(index[targetPath], sourcePath) {
		return
	}
	index[targetPath] = append(index[targetPath], sourcePath)
}

func (l *LinkService) GetBrokenLinks() (map[string][]*WikiLink, error) {
	brokenLinks := make(map[string][]*WikiLink)
	err := l.index.withFresh(func() error {
		for _, entry := range l.index.entries {
			if entry.ignored {
				continue
			}
			var broken []*WikiLink
			for _, link := range l.index.resolver.resolveAll(entry.links, entry.path) {
				if !link.IsValid {
					broken = append(broken, link)
				}
			}
			if len(broken) > 0 {
				brokenLinks[entry.path] = broken
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list pages: %w", err)
	}
	return brokenLinks, nil
}

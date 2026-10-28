package services

import (
	"log"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/MorrisMorrison/schist/internal/serializer"
)

const (
	DefaultSearchLimit = 20
	MaxSearchLimit     = 100

	// Snippet window, in characters, around the best body match.
	snippetBefore = 60
	snippetLength = 180
)

// Where a result's strongest match was found, best first.
const (
	MatchedInTitle   = "title"
	MatchedInHeading = "heading"
	MatchedInTag     = "tag"
	MatchedInContent = "content"
)

// SnippetSegment is one piece of a result snippet; Match marks a query hit.
// Segments (rather than offsets or HTML) let clients highlight safely.
type SnippetSegment struct {
	Text  string `json:"text"`
	Match bool   `json:"match,omitempty"`
}

type SearchResult struct {
	Path      string           `json:"path"`
	Title     string           `json:"title"`
	Tags      []string         `json:"tags,omitempty"`
	MatchedIn string           `json:"matchedIn"`
	Snippet   []SnippetSegment `json:"snippet,omitempty"`
	Score     float64          `json:"score"`
}

// SearchService is a full-text search over every document. It keeps an
// in-memory index that each query brings up to date by stat-ing the data dir
// and re-reading only files whose size or modification time changed, so edits
// made outside the app are picked up without a file watcher.
type SearchService struct {
	documents     *DocumentService
	ignoreService *IgnoreService

	mu      sync.Mutex
	entries map[string]*searchEntry
}

type searchEntry struct {
	path     string
	title    string
	tags     []string
	modTime  time.Time
	size     int64
	titleLow []rune
	headings [][]rune // lower-cased
	tagsLow  [][]rune
	body     []rune // markdown stripped to plain text
	bodyLow  []rune
}

func NewSearchService(documents *DocumentService, ignoreService *IgnoreService) *SearchService {
	return &SearchService{
		documents:     documents,
		ignoreService: ignoreService,
		entries:       map[string]*searchEntry{},
	}
}

// Search returns documents matching every word of query, best first, and the
// total number of matches before limit. "tag:name" words filter by tag. An
// empty query (or one with only empty tag filters) matches nothing.
func (s *SearchService) Search(query string, limit int) ([]SearchResult, int, error) {
	if limit <= 0 {
		limit = DefaultSearchLimit
	}
	limit = min(limit, MaxSearchLimit)

	terms, tagFilters := parseSearchQuery(query)
	if len(terms) == 0 && len(tagFilters) == 0 {
		return []SearchResult{}, 0, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.refresh(); err != nil {
		return nil, 0, err
	}

	results := []SearchResult{}
	for _, entry := range s.entries {
		if !entry.hasTags(tagFilters) {
			continue
		}
		if result, ok := entry.match(terms); ok {
			results = append(results, result)
		}
	}

	sort.Slice(results, func(i, j int) bool {
		if results[i].Score != results[j].Score {
			return results[i].Score > results[j].Score
		}
		return strings.ToLower(results[i].Title) < strings.ToLower(results[j].Title)
	})

	total := len(results)
	if len(results) > limit {
		results = results[:limit]
	}
	return results, total, nil
}

// refresh brings the index in line with the files on disk. Callers hold mu.
func (s *SearchService) refresh() error {
	seen := make(map[string]bool, len(s.entries))

	err := s.documents.walkDocumentFiles(func(fsPath, logicalPath string, dirEntry os.DirEntry) error {
		if s.ignoreService.ShouldIgnore(logicalPath) {
			return nil
		}
		info, err := dirEntry.Info()
		if err != nil {
			return nil // removed while walking
		}
		seen[logicalPath] = true

		if existing := s.entries[logicalPath]; existing != nil &&
			existing.size == info.Size() && existing.modTime.Equal(info.ModTime()) {
			return nil
		}

		entry, err := buildSearchEntry(fsPath, logicalPath)
		if err != nil {
			// Unreadable or mid-write: leave it out and retry next query.
			log.Printf("[SearchService] skipping %s: %v", logicalPath, err)
			delete(s.entries, logicalPath)
			return nil
		}
		entry.modTime, entry.size = info.ModTime(), info.Size()
		s.entries[logicalPath] = entry
		return nil
	})
	if err != nil {
		return err
	}

	for path := range s.entries {
		if !seen[path] {
			delete(s.entries, path)
		}
	}
	return nil
}

func buildSearchEntry(fsPath, logicalPath string) (*searchEntry, error) {
	raw, err := os.ReadFile(fsPath)
	if err != nil {
		return nil, err
	}
	document, err := serializer.DeserializeDocument(raw)
	if err != nil {
		return nil, err
	}

	title := document.MetaData.Title
	if title == "" {
		title = logicalPath[strings.LastIndex(logicalPath, "/")+1:]
	}
	body, headings := markdownToPlainText(document.Content)
	// Most pages open with an H1 repeating the title; keep it out of snippets.
	if len(headings) > 0 && strings.EqualFold(headings[0], title) {
		if rest, ok := strings.CutPrefix(body, headings[0]); ok {
			body = strings.TrimSpace(rest)
		}
	}

	entry := &searchEntry{
		path:     logicalPath,
		title:    title,
		tags:     document.MetaData.Tags,
		titleLow: lowerRunes(title),
		body:     []rune(body),
		bodyLow:  lowerRunes(body),
	}
	for _, heading := range headings {
		entry.headings = append(entry.headings, lowerRunes(heading))
	}
	for _, tag := range document.MetaData.Tags {
		entry.tagsLow = append(entry.tagsLow, lowerRunes(tag))
	}
	return entry, nil
}

// parseSearchQuery splits a query into lower-cased words and tag filters.
// Supports syntax like: "authentication tag:security tag:golang".
func parseSearchQuery(query string) (terms [][]rune, tagFilters []string) {
	for _, word := range strings.Fields(query) {
		lower := strings.ToLower(word)
		if tag, ok := strings.CutPrefix(lower, "tag:"); ok {
			if tag != "" {
				tagFilters = append(tagFilters, tag)
			}
			continue
		}
		terms = append(terms, lowerRunes(word))
	}
	return terms, tagFilters
}

// hasTags reports whether every filter is contained in one of the entry's tags.
func (e *searchEntry) hasTags(filters []string) bool {
	for _, filter := range filters {
		found := false
		for _, tag := range e.tagsLow {
			if strings.Contains(string(tag), filter) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

// Field weights: a word in the title counts far more than one in the body.
const (
	weightTitle   = 10.0
	weightHeading = 5.0
	weightTag     = 4.0
	weightBody    = 1.0
)

// match scores the entry against terms. Every term must match a word prefix
// somewhere; failing that, the whole query may still match the title as a
// fuzzy subsequence ("gtst" finds "Getting started"), with a low score.
func (e *searchEntry) match(terms [][]rune) (SearchResult, bool) {
	result := SearchResult{Path: e.path, Title: e.title, Tags: e.tags}

	if len(terms) == 0 { // tag filters only
		result.MatchedIn = MatchedInTag
		result.Snippet = e.leadSnippet()
		return result, true
	}

	best := 4 // index into the MatchedIn order; 4 = nothing yet
	bodyHit := false
	for _, term := range terms {
		matched := false
		if hasWordPrefix(e.titleLow, term) {
			result.Score += weightTitle
			best, matched = min(best, 0), true
		}
		for _, heading := range e.headings {
			if hasWordPrefix(heading, term) {
				result.Score += weightHeading
				best, matched = min(best, 1), true
				break
			}
		}
		for _, tag := range e.tagsLow {
			if hasWordPrefix(tag, term) {
				result.Score += weightTag
				best, matched = min(best, 2), true
				break
			}
		}
		if count := countWordPrefix(e.bodyLow, term, 5); count > 0 {
			result.Score += weightBody + 0.2*float64(count)
			best, matched, bodyHit = min(best, 3), true, true
		}
		if !matched {
			return e.fuzzyTitleMatch(terms)
		}
	}

	query := joinTerms(terms)
	switch {
	case string(e.titleLow) == string(query):
		result.Score += 30
	case hasPrefixRunes(e.titleLow, query):
		result.Score += 15
	case len(terms) > 1 && indexRunes(e.titleLow, query, 0) >= 0:
		result.Score += 10
	}
	if len(terms) > 1 && indexRunes(e.bodyLow, query, 0) >= 0 {
		result.Score += 3
	}

	result.MatchedIn = []string{MatchedInTitle, MatchedInHeading, MatchedInTag, MatchedInContent}[best]
	if bodyHit {
		result.Snippet = e.matchSnippet(terms, query)
	} else {
		result.Snippet = e.leadSnippet()
	}
	return result, true
}

func (e *searchEntry) fuzzyTitleMatch(terms [][]rune) (SearchResult, bool) {
	var query []rune
	for _, term := range terms {
		query = append(query, term...)
	}
	if !isCompactSubsequence(query, e.titleLow) {
		return SearchResult{}, false
	}
	return SearchResult{
		Path:      e.path,
		Title:     e.title,
		Tags:      e.tags,
		MatchedIn: MatchedInTitle,
		Snippet:   e.leadSnippet(),
		// Below any real match (a single body hit scores more than 1).
		Score: 0.5 * float64(len(query)) / float64(len(e.titleLow)),
	}, true
}

// matchSnippet is a window of the body around the phrase, or else the first
// term found, with every term occurrence in it marked.
func (e *searchEntry) matchSnippet(terms [][]rune, query []rune) []SnippetSegment {
	pos := -1
	if len(terms) > 1 {
		pos = indexRunes(e.bodyLow, query, 0)
	}
	for _, term := range terms {
		if pos >= 0 {
			break
		}
		pos = indexWordPrefix(e.bodyLow, term, 0)
	}
	if pos < 0 {
		return e.leadSnippet()
	}

	start, end := snippetWindow(e.body, pos)
	var hits [][2]int
	if len(terms) > 1 { // mark the phrase as one span
		for i := indexRunes(e.bodyLow[:end], query, start); i >= 0; i = indexRunes(e.bodyLow[:end], query, i+len(query)) {
			hits = append(hits, [2]int{i, i + len(query)})
		}
	}
	for _, term := range terms {
		for i := indexWordPrefix(e.bodyLow[:end], term, start); i >= 0; i = indexWordPrefix(e.bodyLow[:end], term, i+len(term)) {
			hits = append(hits, [2]int{i, min(i+len(term), end)})
		}
	}
	return segments(e.body, start, end, hits)
}

// leadSnippet is the start of the body, unmarked.
func (e *searchEntry) leadSnippet() []SnippetSegment {
	if len(e.body) == 0 {
		return nil
	}
	start, end := snippetWindow(e.body, 0)
	return segments(e.body, start, end, nil)
}

// snippetWindow picks [start, end) around pos, snapped to word boundaries.
func snippetWindow(body []rune, pos int) (int, int) {
	start := max(0, pos-snippetBefore)
	end := min(len(body), start+snippetLength)
	if start > 0 {
		if i := indexRune(body[start:pos], ' '); i >= 0 {
			start += i + 1
		}
	}
	if end < len(body) {
		if i := lastIndexRune(body[pos:end], ' '); i > 0 {
			end = pos + i
		}
	}
	return start, end
}

// segments cuts body[start:end] into plain and marked pieces, with ellipses
// where the window doesn't reach the ends of the body.
func segments(body []rune, start, end int, hits [][2]int) []SnippetSegment {
	sort.Slice(hits, func(i, j int) bool { return hits[i][0] < hits[j][0] })

	var out []SnippetSegment
	add := func(text string, match bool) {
		if text == "" {
			return
		}
		if n := len(out); n > 0 && out[n-1].Match == match {
			out[n-1].Text += text
			return
		}
		out = append(out, SnippetSegment{Text: text, Match: match})
	}

	if start > 0 {
		add("…", false)
	}
	cursor := start
	for _, hit := range hits {
		if hit[0] < cursor { // overlaps the previous hit
			hit[0] = cursor
		}
		if hit[0] >= hit[1] {
			continue
		}
		add(string(body[cursor:hit[0]]), false)
		add(string(body[hit[0]:hit[1]]), true)
		cursor = hit[1]
	}
	add(string(body[cursor:end]), false)
	if end < len(body) {
		add("…", false)
	}
	return out
}

var (
	reFence      = regexp.MustCompile("^\\s*(```|~~~)")
	reHeading    = regexp.MustCompile(`^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$`)
	reListMarker = regexp.MustCompile(`^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)+`)
	reImage      = regexp.MustCompile(`!\[([^\]]*)\]\([^)]*\)`)
	reLink       = regexp.MustCompile(`\[([^\]]*)\]\([^)]*\)`)
	reWikiLink   = regexp.MustCompile(`\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]`)
	reHTMLTag    = regexp.MustCompile(`</?[a-zA-Z][^>]*>`)
	reEmphasis   = regexp.MustCompile("(\\*\\*|__|\\*|~~|`)")
	reRule       = regexp.MustCompile(`^\s*([-*_]\s*){3,}$`)
	reSpaces     = regexp.MustCompile(`\s+`)
)

// markdownToPlainText strips markdown syntax so snippets read as text and
// words match cleanly. Code block contents are kept; fence lines are not.
func markdownToPlainText(markdown string) (string, []string) {
	var headings []string
	var text strings.Builder
	for _, line := range strings.Split(markdown, "\n") {
		if reFence.MatchString(line) || reRule.MatchString(line) {
			continue
		}
		if m := reHeading.FindStringSubmatch(line); m != nil {
			line = m[1]
			headings = append(headings, inlinePlainText(line))
		}
		line = reListMarker.ReplaceAllString(line, "")
		text.WriteString(inlinePlainText(line))
		text.WriteByte(' ')
	}
	return strings.TrimSpace(reSpaces.ReplaceAllString(text.String(), " ")), headings
}

func inlinePlainText(line string) string {
	line = reImage.ReplaceAllString(line, "$1")
	line = reLink.ReplaceAllString(line, "$1")
	line = reWikiLink.ReplaceAllStringFunc(line, func(m string) string {
		parts := reWikiLink.FindStringSubmatch(m)
		if parts[2] != "" {
			return parts[2]
		}
		return parts[1]
	})
	line = reHTMLTag.ReplaceAllString(line, "")
	line = strings.ReplaceAll(line, "|", " ") // table cells
	return reEmphasis.ReplaceAllString(line, "")
}

// lowerRunes lower-cases rune by rune, so indexes into the result line up
// with the original text.
func lowerRunes(s string) []rune {
	runes := []rune(s)
	for i, r := range runes {
		runes[i] = unicode.ToLower(r)
	}
	return runes
}

func joinTerms(terms [][]rune) []rune {
	var out []rune
	for i, term := range terms {
		if i > 0 {
			out = append(out, ' ')
		}
		out = append(out, term...)
	}
	return out
}

func isWordRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r)
}

// indexWordPrefix finds term starting at a word boundary at or after from.
func indexWordPrefix(text, term []rune, from int) int {
	for i := indexRunes(text, term, from); i >= 0; i = indexRunes(text, term, i+1) {
		if i == 0 || !isWordRune(text[i-1]) || !isWordRune(term[0]) {
			return i
		}
	}
	return -1
}

func hasWordPrefix(text, term []rune) bool {
	return indexWordPrefix(text, term, 0) >= 0
}

func countWordPrefix(text, term []rune, limit int) int {
	count := 0
	for i := indexWordPrefix(text, term, 0); i >= 0 && count < limit; i = indexWordPrefix(text, term, i+len(term)) {
		count++
	}
	return count
}

func indexRunes(text, term []rune, from int) int {
	if len(term) == 0 {
		return -1
	}
	for i := max(from, 0); i+len(term) <= len(text); i++ {
		if text[i] == term[0] && hasPrefixRunes(text[i:], term) {
			return i
		}
	}
	return -1
}

func hasPrefixRunes(text, prefix []rune) bool {
	if len(prefix) > len(text) {
		return false
	}
	for i, r := range prefix {
		if text[i] != r {
			return false
		}
	}
	return true
}

func indexRune(text []rune, r rune) int {
	for i, c := range text {
		if c == r {
			return i
		}
	}
	return -1
}

func lastIndexRune(text []rune, r rune) int {
	for i := len(text) - 1; i >= 0; i-- {
		if text[i] == r {
			return i
		}
	}
	return -1
}

// isCompactSubsequence reports whether needle's runes appear in order in
// haystack, starting at a word start and close together ("gtst" and "gs"
// match "getting started"; "gtst" doesn't match "meeting notes template").
func isCompactSubsequence(needle, haystack []rune) bool {
	if len(needle) == 0 {
		return false
	}
	for start, r := range haystack {
		if r != needle[0] || (start > 0 && isWordRune(haystack[start-1])) {
			continue
		}
		i := 1
		for pos := start + 1; pos < len(haystack) && i < len(needle) && pos-start < 4*len(needle)+8; pos++ {
			if haystack[pos] == needle[i] {
				i++
			}
		}
		if i == len(needle) {
			return true
		}
	}
	return false
}

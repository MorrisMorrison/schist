package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"log"
	"path"
	"sort"
	"strings"
	"time"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/MorrisMorrison/schist/internal/utils"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type tools struct {
	svc *services.Services
}

func (t *tools) registerRead(s *mcp.Server) {
	read := &mcp.ToolAnnotations{ReadOnlyHint: true}
	mcp.AddTool(s, &mcp.Tool{
		Name:        "search",
		Description: "Full-text search over titles, headings, tags and page text. Every word must match the start of a word; add tag:name to filter by tag. Results are ranked, title matches first, with a snippet.",
		Annotations: read,
	}, t.search)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "read_document",
		Description: "Read a page: its markdown content plus title, tags and dates.",
		Annotations: read,
	}, t.readDocument)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "list_folder",
		Description: `List a folder's subfolders and the pages directly in it. Use "/" for the root.`,
		Annotations: read,
	}, t.listFolder)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "get_backlinks",
		Description: "List the pages that link to a page with [[wiki links]].",
		Annotations: read,
	}, t.getBacklinks)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "list_tags",
		Description: "List every tag in the wiki with the number of pages using it.",
		Annotations: read,
	}, t.listTags)
}

func (t *tools) registerWrite(s *mcp.Server) {
	notDestructive := false
	mcp.AddTool(s, &mcp.Tool{
		Name:        "create_document",
		Description: "Create a new page. Fails if a page already exists at that path. The change is committed to git.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: &notDestructive},
	}, t.createDocument)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "update_document",
		Description: "Replace a page's content, title or tags (only the fields you pass). The previous version stays in git history.",
		Annotations: &mcp.ToolAnnotations{IdempotentHint: true},
	}, t.updateDocument)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "append_to_document",
		Description: "Add markdown to a page: at the end, or at the end of the section under a given heading. Safer than update_document for adding notes.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: &notDestructive},
	}, t.appendToDocument)
}

// --- read tools ---

type searchIn struct {
	Query string `json:"query" jsonschema:"search words, optionally with tag:name filters"`
	Limit int    `json:"limit,omitempty" jsonschema:"maximum number of results (default 20, max 100)"`
}

type searchHit struct {
	Path      string   `json:"path"`
	Title     string   `json:"title"`
	Tags      []string `json:"tags,omitempty"`
	MatchedIn string   `json:"matchedIn"`
	Snippet   string   `json:"snippet,omitempty" jsonschema:"excerpt with matches in **bold**"`
}

type searchOut struct {
	Results []searchHit `json:"results"`
	Total   int         `json:"total" jsonschema:"all matches, even when results are cut by limit"`
}

func (t *tools) search(_ context.Context, _ *mcp.CallToolRequest, in searchIn) (*mcp.CallToolResult, searchOut, error) {
	results, total, err := t.svc.SearchService.Search(in.Query, in.Limit)
	if err != nil {
		return nil, searchOut{}, toolError(err)
	}
	out := searchOut{Results: []searchHit{}, Total: total}
	var text strings.Builder
	if total == 0 {
		text.WriteString("No pages match.")
	} else {
		fmt.Fprintf(&text, "%d of %d matching pages:\n", len(results), total)
	}
	for i, r := range results {
		hit := searchHit{Path: r.Path, Title: r.Title, Tags: r.Tags, MatchedIn: r.MatchedIn, Snippet: snippetText(r.Snippet)}
		out.Results = append(out.Results, hit)
		fmt.Fprintf(&text, "\n%d. %s (%s)", i+1, hit.Title, hit.Path)
		if hit.Snippet != "" {
			fmt.Fprintf(&text, "\n   %s", hit.Snippet)
		}
	}
	return textResult(text.String()), out, nil
}

// snippetText renders snippet segments with matches in **bold**.
func snippetText(segments []services.SnippetSegment) string {
	var b strings.Builder
	for _, s := range segments {
		if s.Match {
			b.WriteString("**" + s.Text + "**")
		} else {
			b.WriteString(s.Text)
		}
	}
	return b.String()
}

type pathIn struct {
	Path string `json:"path" jsonschema:"page path, e.g. /guides/getting-started"`
}

type documentOut struct {
	Path    string   `json:"path"`
	Title   string   `json:"title"`
	Tags    []string `json:"tags,omitempty"`
	Created string   `json:"created,omitempty"`
	Updated string   `json:"updated,omitempty"`
	Content string   `json:"content"`
}

func (t *tools) readDocument(_ context.Context, _ *mcp.CallToolRequest, in pathIn) (*mcp.CallToolResult, documentOut, error) {
	doc, err := t.svc.DocumentService.GetDocumentByPath(documentPath(in.Path))
	if err != nil {
		return nil, documentOut{}, toolError(err)
	}
	out := documentOut{
		Path:    documentPath(in.Path),
		Title:   doc.MetaData.Title,
		Tags:    doc.MetaData.Tags,
		Created: formatTime(doc.MetaData.Created),
		Updated: formatTime(doc.MetaData.Updated),
		Content: doc.Content,
	}
	header := fmt.Sprintf("Title: %s\nPath: %s\n", out.Title, out.Path)
	if len(out.Tags) > 0 {
		header += "Tags: " + strings.Join(out.Tags, ", ") + "\n"
	}
	if out.Updated != "" {
		header += "Updated: " + out.Updated + "\n"
	}
	return textResult(header + "\n" + out.Content), out, nil
}

type folderIn struct {
	Path string `json:"path,omitempty" jsonschema:"folder path; empty or / for the root"`
}

type folderEntry struct {
	Name          string `json:"name"`
	Path          string `json:"path"`
	DocumentCount int    `json:"documentCount"`
}

type pageEntry struct {
	Title   string   `json:"title"`
	Path    string   `json:"path"`
	Tags    []string `json:"tags,omitempty"`
	Updated string   `json:"updated,omitempty"`
}

type folderOut struct {
	Path      string        `json:"path"`
	Folders   []folderEntry `json:"folders"`
	Documents []pageEntry   `json:"documents"`
}

func (t *tools) listFolder(_ context.Context, _ *mcp.CallToolRequest, in folderIn) (*mcp.CallToolResult, folderOut, error) {
	folderPath := utils.NormalizePath(utils.EnsureLeadingSlash(strings.TrimSpace(in.Path)))
	folder, err := t.svc.DocumentService.GetFolder(folderPath)
	if err != nil {
		return nil, folderOut{}, toolError(err)
	}
	out := folderOut{Path: folderPath, Folders: []folderEntry{}, Documents: []pageEntry{}}
	for _, sub := range folder.SubFolders {
		if t.svc.IgnoreService.ShouldIgnore(sub.Path) {
			continue
		}
		out.Folders = append(out.Folders, folderEntry{Name: sub.Name, Path: sub.Path, DocumentCount: sub.DocumentCount})
	}

	documents, err := t.svc.DocumentService.ListDocuments()
	if err != nil {
		return nil, folderOut{}, toolError(err)
	}
	for _, doc := range documents {
		p := doc.MetaData.Path
		if path.Dir(p) != folderPath || t.svc.IgnoreService.ShouldIgnore(p) {
			continue
		}
		out.Documents = append(out.Documents, pageEntry{
			Title: doc.MetaData.Title, Path: p, Tags: doc.MetaData.Tags, Updated: formatTime(doc.MetaData.Updated),
		})
	}
	sort.Slice(out.Documents, func(i, j int) bool {
		return strings.ToLower(out.Documents[i].Title) < strings.ToLower(out.Documents[j].Title)
	})

	var text strings.Builder
	fmt.Fprintf(&text, "Folder %s: %d folders, %d pages\n", out.Path, len(out.Folders), len(out.Documents))
	for _, f := range out.Folders {
		fmt.Fprintf(&text, "\n[folder] %s (%d pages)", f.Path, f.DocumentCount)
	}
	for _, d := range out.Documents {
		fmt.Fprintf(&text, "\n%s (%s)", d.Title, d.Path)
	}
	return textResult(text.String()), out, nil
}

type backlinksOut struct {
	Path      string      `json:"path"`
	Backlinks []pageEntry `json:"backlinks"`
}

func (t *tools) getBacklinks(_ context.Context, _ *mcp.CallToolRequest, in pathIn) (*mcp.CallToolResult, backlinksOut, error) {
	target := documentPath(in.Path)
	if _, err := t.svc.DocumentService.GetDocumentByPath(target); err != nil {
		return nil, backlinksOut{}, toolError(err)
	}
	paths, err := t.svc.LinkService.GetBacklinks(target)
	if err != nil {
		return nil, backlinksOut{}, toolError(err)
	}
	out := backlinksOut{Path: target, Backlinks: []pageEntry{}}
	var text strings.Builder
	fmt.Fprintf(&text, "%d pages link to %s", len(paths), target)
	for _, p := range paths {
		entry := pageEntry{Path: p, Title: p}
		if doc, err := t.svc.DocumentService.GetDocumentByPath(p); err == nil {
			entry.Title = doc.MetaData.Title
		}
		out.Backlinks = append(out.Backlinks, entry)
		fmt.Fprintf(&text, "\n%s (%s)", entry.Title, entry.Path)
	}
	return textResult(text.String()), out, nil
}

type tagCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type tagsOut struct {
	Tags []tagCount `json:"tags"`
}

func (t *tools) listTags(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, tagsOut, error) {
	counts, err := t.svc.DocumentService.GetAllTags()
	if err != nil {
		return nil, tagsOut{}, toolError(err)
	}
	out := tagsOut{Tags: []tagCount{}}
	for name, count := range counts {
		out.Tags = append(out.Tags, tagCount{Name: name, Count: count})
	}
	sort.Slice(out.Tags, func(i, j int) bool {
		if out.Tags[i].Count != out.Tags[j].Count {
			return out.Tags[i].Count > out.Tags[j].Count
		}
		return out.Tags[i].Name < out.Tags[j].Name
	})
	return nil, out, nil
}

// --- write tools ---

type createIn struct {
	Path    string   `json:"path" jsonschema:"new page path, e.g. /notes/meeting-2026-10-28"`
	Title   string   `json:"title,omitempty" jsonschema:"page title; defaults to one made from the path"`
	Content string   `json:"content" jsonschema:"markdown content"`
	Tags    []string `json:"tags,omitempty"`
}

type writeOut struct {
	Path    string `json:"path"`
	Title   string `json:"title"`
	Message string `json:"message"`
}

func (t *tools) createDocument(_ context.Context, _ *mcp.CallToolRequest, in createIn) (*mcp.CallToolResult, writeOut, error) {
	p := documentPath(in.Path)
	if p == "/" {
		return nil, writeOut{}, errors.New("path is required, e.g. /notes/my-page")
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = titleFromPath(p)
	}
	doc := &models.Document{
		MetaData: &models.DocumentMetaData{Title: title, Path: p, Tags: in.Tags},
		Content:  in.Content,
	}
	if err := t.svc.DocumentService.CreateDocument(doc); err != nil {
		return nil, writeOut{}, toolError(err)
	}
	t.refreshLinks(doc.MetaData.Path)
	return nil, writeOut{Path: doc.MetaData.Path, Title: title, Message: "Created " + doc.MetaData.Path}, nil
}

type updateIn struct {
	Path    string    `json:"path"`
	Content *string   `json:"content,omitempty" jsonschema:"new markdown content; replaces the whole page"`
	Title   *string   `json:"title,omitempty"`
	Tags    *[]string `json:"tags,omitempty" jsonschema:"new tag list; replaces the existing tags"`
}

func (t *tools) updateDocument(_ context.Context, _ *mcp.CallToolRequest, in updateIn) (*mcp.CallToolResult, writeOut, error) {
	if in.Content == nil && in.Title == nil && in.Tags == nil {
		return nil, writeOut{}, errors.New("pass at least one of content, title or tags")
	}
	doc, err := t.svc.DocumentService.GetDocumentByPath(documentPath(in.Path))
	if err != nil {
		return nil, writeOut{}, toolError(err)
	}
	if in.Content != nil {
		doc.Content = *in.Content
	}
	if in.Title != nil {
		if strings.TrimSpace(*in.Title) == "" {
			return nil, writeOut{}, errors.New("title can't be empty")
		}
		doc.MetaData.Title = strings.TrimSpace(*in.Title)
	}
	if in.Tags != nil {
		doc.MetaData.Tags = *in.Tags
	}
	return t.save(doc, "Updated ")
}

type appendIn struct {
	Path    string `json:"path"`
	Content string `json:"content" jsonschema:"markdown to add"`
	Heading string `json:"heading,omitempty" jsonschema:"add to the end of the section under this heading (its text, without #s); empty adds at the end of the page"`
}

func (t *tools) appendToDocument(_ context.Context, _ *mcp.CallToolRequest, in appendIn) (*mcp.CallToolResult, writeOut, error) {
	if strings.TrimSpace(in.Content) == "" {
		return nil, writeOut{}, errors.New("content is required")
	}
	doc, err := t.svc.DocumentService.GetDocumentByPath(documentPath(in.Path))
	if err != nil {
		return nil, writeOut{}, toolError(err)
	}
	content, err := appendMarkdown(doc.Content, in.Content, in.Heading)
	if err != nil {
		return nil, writeOut{}, err
	}
	doc.Content = content
	return t.save(doc, "Appended to ")
}

func (t *tools) save(doc *models.Document, verb string) (*mcp.CallToolResult, writeOut, error) {
	if err := t.svc.DocumentService.UpdateDocumentWithSaveType(doc, "manual"); err != nil {
		return nil, writeOut{}, toolError(err)
	}
	t.refreshLinks(doc.MetaData.Path)
	return nil, writeOut{Path: doc.MetaData.Path, Title: doc.MetaData.Title, Message: verb + doc.MetaData.Path}, nil
}

func (t *tools) refreshLinks(p string) {
	if err := t.svc.LinkService.UpdateBacklinks(p); err != nil {
		log.Printf("[MCP] failed to update backlinks for %s: %v", p, err)
	}
}

// appendMarkdown adds addition at the end of content, or at the end of the
// section under heading: before the next heading of the same or a higher level.
func appendMarkdown(content, addition, heading string) (string, error) {
	addition = strings.Trim(addition, "\n")
	if strings.TrimSpace(heading) == "" {
		base := strings.TrimRight(content, "\n")
		if base == "" {
			return addition + "\n", nil
		}
		return base + "\n\n" + addition + "\n", nil
	}

	lines := strings.Split(content, "\n")
	want := strings.ToLower(strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(heading), "#")))
	start, level := -1, 0
	inFence := false
	for i, line := range lines {
		if isFence(line) {
			inFence = !inFence
		}
		if inFence {
			continue
		}
		if l, text := headingLine(line); l > 0 && strings.ToLower(text) == want {
			start, level = i, l
			break
		}
	}
	if start < 0 {
		return "", fmt.Errorf("no heading %q in this page; omit heading to append at the end", heading)
	}

	end := len(lines)
	inFence = false
	for i := start + 1; i < len(lines); i++ {
		if isFence(lines[i]) {
			inFence = !inFence
		}
		if inFence {
			continue
		}
		if l, _ := headingLine(lines[i]); l > 0 && l <= level {
			end = i
			break
		}
	}
	// Insert after the section's last non-blank line.
	insertAt := end
	for insertAt > start+1 && strings.TrimSpace(lines[insertAt-1]) == "" {
		insertAt--
	}
	head := strings.Join(lines[:insertAt], "\n")
	rest := lines[insertAt:]
	for len(rest) > 0 && strings.TrimSpace(rest[0]) == "" {
		rest = rest[1:]
	}
	if len(rest) == 0 {
		return head + "\n\n" + addition + "\n", nil
	}
	return head + "\n\n" + addition + "\n\n" + strings.Join(rest, "\n"), nil
}

func headingLine(line string) (int, string) {
	trimmed := strings.TrimLeft(line, " ")
	if len(line)-len(trimmed) > 3 {
		return 0, ""
	}
	level := 0
	for level < len(trimmed) && trimmed[level] == '#' {
		level++
	}
	if level == 0 || level > 6 || (level < len(trimmed) && trimmed[level] != ' ') {
		return 0, ""
	}
	return level, strings.TrimSpace(strings.TrimRight(strings.TrimSpace(trimmed[level:]), "#"))
}

func isFence(line string) bool {
	t := strings.TrimSpace(line)
	return strings.HasPrefix(t, "```") || strings.HasPrefix(t, "~~~")
}

// --- helpers ---

// documentPath normalizes a page path from a client: a leading slash, no
// ".md" suffix, no doubled slashes.
func documentPath(p string) string {
	p = strings.TrimSuffix(strings.TrimSpace(p), ".md")
	return utils.NormalizePath(utils.EnsureLeadingSlash(p))
}

func titleFromPath(p string) string {
	name := strings.ReplaceAll(path.Base(p), "-", " ")
	if name == "" {
		return "Untitled"
	}
	return strings.ToUpper(name[:1]) + name[1:]
}

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}
}

// toolError turns a service error into one the model can read and act on.
// Typed API errors carry client-safe messages; anything else is logged and
// reported generically, so file system details never reach the client.
func toolError(err error) error {
	var apiErr *apierrors.APIError
	if errors.As(err, &apiErr) && apiErr.HTTPStatus < 500 {
		return errors.New(apiErr.Message)
	}
	log.Printf("[MCP] tool failed: %v", err)
	return errors.New("internal error; see the Schist server log")
}

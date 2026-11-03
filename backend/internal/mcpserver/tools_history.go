package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/sergi/go-diff/diffmatchpatch"
)

// minVersionPrefix is the shortest commit hash prefix accepted for a version,
// the length git itself shows.
const minVersionPrefix = 7

// diffContext is how many unchanged lines diff_versions shows around a change.
const diffContext = 2

func (t *tools) registerHistory(s *mcp.Server, write bool) {
	read := &mcp.ToolAnnotations{ReadOnlyHint: true}
	mcp.AddTool(s, &mcp.Tool{
		Name:        "list_versions",
		Description: "List a page's saved versions (git commits), newest first, with a short hash to pass to read_version, diff_versions or restore_version.",
		Annotations: read,
	}, t.listVersions)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "read_version",
		Description: "Read a page as it was at an earlier version.",
		Annotations: read,
	}, t.readVersion)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "diff_versions",
		Description: "Show what changed in a page between two versions (to defaults to the latest), as lines starting with + or -.",
		Annotations: read,
	}, t.diffVersions)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "get_outgoing_links",
		Description: "List the [[wiki links]] on a page, each with the page it points to or marked broken.",
		Annotations: read,
	}, t.getOutgoingLinks)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "list_broken_links",
		Description: "List every page with [[wiki links]] to pages that don't exist.",
		Annotations: read,
	}, t.listBrokenLinks)
	if write {
		notDestructive := false
		mcp.AddTool(s, &mcp.Tool{
			Name: "restore_version",
			Description: "Restore a page to an earlier version. This saves the old content as a new version, so the " +
				"current content stays in history and the restore can be undone the same way.",
			Annotations: &mcp.ToolAnnotations{DestructiveHint: &notDestructive},
		}, t.restoreVersion)
	}
}

type versionEntry struct {
	Hash    string `json:"hash"`
	Short   string `json:"short"`
	Message string `json:"message"`
	Author  string `json:"author,omitempty"`
	Date    string `json:"date"`
}

type versionsOut struct {
	Path     string         `json:"path"`
	Versions []versionEntry `json:"versions"`
}

// versions lists a page's versions, newest first. It fails for a page that
// doesn't exist, which the service reports as an empty history.
func (t *tools) versions(p string) ([]*services.DocumentVersion, error) {
	if _, err := t.svc.DocumentService.GetDocumentByPath(p); err != nil {
		return nil, toolError(err)
	}
	versions, err := t.svc.DocumentService.GetDocumentVersions(p)
	if err != nil {
		return nil, toolError(err)
	}
	return versions, nil
}

func (t *tools) listVersions(_ context.Context, _ *mcp.CallToolRequest, in pathIn) (*mcp.CallToolResult, versionsOut, error) {
	p := documentPath(in.Path)
	versions, err := t.versions(p)
	if err != nil {
		return nil, versionsOut{}, err
	}
	out := versionsOut{Path: p, Versions: []versionEntry{}}
	var text strings.Builder
	fmt.Fprintf(&text, "%s of %s, newest first:", plural(len(versions), "version", "versions"), p)
	for _, v := range versions {
		e := versionEntry{
			Hash: v.Hash, Short: shortHash(v.Hash), Message: strings.TrimSpace(v.Message),
			Author: v.Author, Date: formatTime(v.Timestamp),
		}
		out.Versions = append(out.Versions, e)
		fmt.Fprintf(&text, "\n%s  %s  %s", e.Short, e.Date, e.Message)
	}
	return textResult(text.String()), out, nil
}

// resolveVersion turns a full hash or a unique prefix of one into the full
// hash of one of the page's versions.
func (t *tools) resolveVersion(p, version string) (string, error) {
	version = strings.ToLower(strings.TrimSpace(version))
	if len(version) < minVersionPrefix {
		return "", fmt.Errorf("pass a version hash from list_versions (at least %d characters)", minVersionPrefix)
	}
	versions, err := t.versions(p)
	if err != nil {
		return "", err
	}
	var match string
	for _, v := range versions {
		if strings.HasPrefix(v.Hash, version) {
			if match != "" && match != v.Hash {
				return "", fmt.Errorf("version %s matches more than one version of %s; pass more characters", version, p)
			}
			match = v.Hash
		}
	}
	if match == "" {
		return "", fmt.Errorf("no version %s of %s; see list_versions", version, p)
	}
	return match, nil
}

type versionIn struct {
	Path    string `json:"path"`
	Version string `json:"version" jsonschema:"version hash from list_versions (the short form works)"`
}

type versionOut struct {
	Path    string   `json:"path"`
	Hash    string   `json:"hash"`
	Title   string   `json:"title"`
	Tags    []string `json:"tags,omitempty"`
	Content string   `json:"content"`
}

func (t *tools) readVersion(_ context.Context, _ *mcp.CallToolRequest, in versionIn) (*mcp.CallToolResult, versionOut, error) {
	p := documentPath(in.Path)
	hash, err := t.resolveVersion(p, in.Version)
	if err != nil {
		return nil, versionOut{}, err
	}
	doc, err := t.svc.DocumentService.GetDocumentAtVersion(p, hash)
	if err != nil {
		return nil, versionOut{}, toolError(err)
	}
	out := versionOut{Path: p, Hash: hash, Content: doc.Content}
	if doc.MetaData != nil {
		out.Title, out.Tags = doc.MetaData.Title, doc.MetaData.Tags
	}
	header := fmt.Sprintf("Title: %s\nPath: %s\nVersion: %s\n", out.Title, p, shortHash(hash))
	return textResult(header + "\n" + out.Content), out, nil
}

type diffIn struct {
	Path string `json:"path"`
	From string `json:"from" jsonschema:"older version hash from list_versions"`
	To   string `json:"to,omitempty" jsonschema:"newer version hash; default the latest version"`
}

type diffOut struct {
	Path      string   `json:"path"`
	From      string   `json:"from"`
	To        string   `json:"to"`
	Additions int      `json:"additions"`
	Deletions int      `json:"deletions"`
	Diff      string   `json:"diff" jsonschema:"changed lines of the page text with + or -, and a little unchanged context"`
	Changes   []string `json:"changes,omitempty" jsonschema:"title and tag changes"`
}

func (t *tools) diffVersions(_ context.Context, _ *mcp.CallToolRequest, in diffIn) (*mcp.CallToolResult, diffOut, error) {
	p := documentPath(in.Path)
	if strings.TrimSpace(in.From) == "" {
		return nil, diffOut{}, errors.New("from is required: a version hash from list_versions")
	}
	from, err := t.resolveVersion(p, in.From)
	if err != nil {
		return nil, diffOut{}, err
	}
	var to string
	if strings.TrimSpace(in.To) == "" {
		versions, err := t.versions(p)
		if err != nil {
			return nil, diffOut{}, err
		}
		to = versions[0].Hash
	} else if to, err = t.resolveVersion(p, in.To); err != nil {
		return nil, diffOut{}, err
	}

	older, err := t.svc.DocumentService.GetDocumentAtVersion(p, from)
	if err != nil {
		return nil, diffOut{}, toolError(err)
	}
	newer, err := t.svc.DocumentService.GetDocumentAtVersion(p, to)
	if err != nil {
		return nil, diffOut{}, toolError(err)
	}

	lines := diffLines(older.Content, newer.Content)
	out := diffOut{Path: p, From: from, To: to, Diff: renderDiff(lines)}
	for _, l := range lines {
		switch l.op {
		case '+':
			out.Additions++
		case '-':
			out.Deletions++
		}
	}
	if older.MetaData != nil && newer.MetaData != nil {
		if older.MetaData.Title != newer.MetaData.Title {
			out.Changes = append(out.Changes, fmt.Sprintf("title: %q -> %q", older.MetaData.Title, newer.MetaData.Title))
		}
		if a, b := strings.Join(older.MetaData.Tags, ", "), strings.Join(newer.MetaData.Tags, ", "); a != b {
			out.Changes = append(out.Changes, fmt.Sprintf("tags: [%s] -> [%s]", a, b))
		}
	}

	var text strings.Builder
	fmt.Fprintf(&text, "%s: %s -> %s, +%d -%d lines", p, shortHash(from), shortHash(to), out.Additions, out.Deletions)
	for _, c := range out.Changes {
		text.WriteString("\n" + c)
	}
	if out.Diff == "" {
		text.WriteString("\nThe text is the same.")
	} else {
		text.WriteString("\n\n" + out.Diff)
	}
	return textResult(text.String()), out, nil
}

type diffLine struct {
	op   byte // '+', '-' or ' '
	text string
}

// diffLines compares two texts line by line.
func diffLines(older, newer string) []diffLine {
	dmp := diffmatchpatch.New()
	a, b, lineArray := dmp.DiffLinesToChars(older, newer)
	diffs := dmp.DiffCharsToLines(dmp.DiffMain(a, b, false), lineArray)
	var lines []diffLine
	for _, d := range diffs {
		op := byte(' ')
		switch d.Type {
		case diffmatchpatch.DiffInsert:
			op = '+'
		case diffmatchpatch.DiffDelete:
			op = '-'
		}
		for _, text := range strings.SplitAfter(d.Text, "\n") {
			if text != "" {
				lines = append(lines, diffLine{op: op, text: strings.TrimSuffix(text, "\n")})
			}
		}
	}
	return lines
}

// renderDiff writes changed lines with + or - and up to diffContext unchanged
// lines around them; longer unchanged stretches become "...".
func renderDiff(lines []diffLine) string {
	keep := make([]bool, len(lines))
	for i, l := range lines {
		if l.op == ' ' {
			continue
		}
		for j := max(0, i-diffContext); j <= min(len(lines)-1, i+diffContext); j++ {
			keep[j] = true
		}
	}
	var b strings.Builder
	skipped := false
	for i, l := range lines {
		if !keep[i] {
			skipped = true
			continue
		}
		if skipped && b.Len() > 0 {
			b.WriteString("...\n")
		}
		skipped = false
		b.WriteByte(l.op)
		b.WriteByte(' ')
		b.WriteString(l.text)
		b.WriteByte('\n')
	}
	return strings.TrimRight(b.String(), "\n")
}

func (t *tools) restoreVersion(_ context.Context, _ *mcp.CallToolRequest, in versionIn) (*mcp.CallToolResult, writeOut, error) {
	p := documentPath(in.Path)
	hash, err := t.resolveVersion(p, in.Version)
	if err != nil {
		return nil, writeOut{}, err
	}
	if err := t.svc.DocumentService.RestoreDocumentToVersion(p, hash); err != nil {
		return nil, writeOut{}, toolError(err)
	}
	t.refreshLinks(p)
	title := p
	if doc, err := t.svc.DocumentService.GetDocumentByPath(p); err == nil {
		title = doc.MetaData.Title
	}
	return nil, writeOut{
		Path: p, Title: title,
		Message: fmt.Sprintf("Restored %s to %s; the content before the restore is the previous version", p, shortHash(hash)),
	}, nil
}

type linkEntry struct {
	Target string `json:"target" jsonschema:"the link as written inside [[ ]]"`
	Text   string `json:"text" jsonschema:"the text shown for the link"`
	Path   string `json:"path,omitempty" jsonschema:"the page it points to"`
	Exists bool   `json:"exists"`
}

type outgoingOut struct {
	Path   string      `json:"path"`
	Links  []linkEntry `json:"links"`
	Broken int         `json:"broken"`
}

func (t *tools) getOutgoingLinks(_ context.Context, _ *mcp.CallToolRequest, in pathIn) (*mcp.CallToolResult, outgoingOut, error) {
	p := documentPath(in.Path)
	if _, err := t.svc.DocumentService.GetDocumentByPath(p); err != nil {
		return nil, outgoingOut{}, toolError(err)
	}
	links, err := t.svc.LinkService.GetOutgoingLinks(p)
	if err != nil {
		return nil, outgoingOut{}, toolError(err)
	}
	out := outgoingOut{Path: p, Links: []linkEntry{}}
	var text strings.Builder
	fmt.Fprintf(&text, "%s on %s", plural(len(links), "link", "links"), p)
	for _, l := range links {
		e := linkEntry{Target: l.Target, Text: l.DisplayText, Exists: l.IsValid}
		if l.IsValid {
			e.Path = l.Path
			fmt.Fprintf(&text, "\n[[%s]] → %s", e.Target, e.Path)
		} else {
			out.Broken++
			fmt.Fprintf(&text, "\n[[%s]] (broken)", e.Target)
		}
		out.Links = append(out.Links, e)
	}
	return textResult(text.String()), out, nil
}

type brokenPage struct {
	Path    string   `json:"path"`
	Title   string   `json:"title"`
	Targets []string `json:"targets" jsonschema:"link targets that match no page"`
}

type brokenOut struct {
	Pages []brokenPage `json:"pages"`
	Total int          `json:"total" jsonschema:"broken links over all pages"`
}

func (t *tools) listBrokenLinks(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, brokenOut, error) {
	broken, err := t.svc.LinkService.GetBrokenLinks()
	if err != nil {
		return nil, brokenOut{}, toolError(err)
	}
	out := brokenOut{Pages: []brokenPage{}}
	for p, links := range broken {
		page := brokenPage{Path: p, Title: p}
		if doc, err := t.svc.DocumentService.GetDocumentByPath(p); err == nil {
			page.Title = doc.MetaData.Title
		}
		for _, l := range links {
			page.Targets = append(page.Targets, l.Target)
		}
		out.Total += len(page.Targets)
		out.Pages = append(out.Pages, page)
	}
	sort.Slice(out.Pages, func(i, j int) bool { return out.Pages[i].Path < out.Pages[j].Path })

	var text strings.Builder
	if out.Total == 0 {
		text.WriteString("No broken links.")
	} else {
		fmt.Fprintf(&text, "%s on %s:", plural(out.Total, "broken link", "broken links"), plural(len(out.Pages), "page", "pages"))
	}
	for _, page := range out.Pages {
		fmt.Fprintf(&text, "\n%s (%s): [[%s]]", page.Title, page.Path, strings.Join(page.Targets, "]], [["))
	}
	return textResult(text.String()), out, nil
}

func shortHash(hash string) string {
	if len(hash) > minVersionPrefix {
		return hash[:minVersionPrefix]
	}
	return hash
}

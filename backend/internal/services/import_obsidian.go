package services

import (
	"fmt"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/MorrisMorrison/schist/internal/serializer"
	"github.com/MorrisMorrison/schist/internal/utils"
	"gopkg.in/yaml.v2"
)

// Markdown from Obsidian (and similar tools) is converted on import to what
// Schist renders: title, tags and dates are taken from the front matter and
// the other keys are kept as properties, plugin
// syntax (Dataview, Templater, comments, block IDs) is removed, callouts and
// embeds become plain markdown, and links are rewritten so they resolve.
// Everything that is dropped or changed is reported per file.

// importedNote is one markdown file after conversion, before it is written.
type importedNote struct {
	title   string
	tags    []string
	created time.Time
	updated time.Time
	// properties are the other front matter keys, kept as they are.
	properties map[string]any
	body       string
	notes      []string
}

var importFrontMatterBlock = regexp.MustCompile(`(?s)^---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)`)

// parseImportedMarkdown splits off and interprets the front matter, then
// converts the body. Links are rewritten later, once every file of the import
// is known (see rewriteImportLinks).
func parseImportedMarkdown(content, filename string) importedNote {
	var note importedNote
	body := strings.ReplaceAll(content, "\r\n", "\n")

	if m := importFrontMatterBlock.FindStringSubmatchIndex(body); m != nil {
		raw := body[m[2]:m[3]]
		body = body[m[1]:]
		note.applyFrontMatter(raw)
	}

	body, note.notes = convertObsidianMarkdown(body, note.notes)
	note.body = strings.TrimSpace(body)

	if note.title == "" {
		note.title = firstHeading(note.body)
	}
	if note.title == "" {
		note.title = strings.TrimSuffix(path.Base(filename), path.Ext(filename))
	}
	return note
}

// applyFrontMatter reads title, tags and dates into Schist's fields and keeps
// every other key as a property.
func (n *importedNote) applyFrontMatter(raw string) {
	var fields map[string]any
	if err := yaml.Unmarshal([]byte(raw), &fields); err != nil {
		n.notes = append(n.notes, "front matter could not be read and was dropped")
		return
	}

	for key, value := range fields {
		switch strings.ToLower(key) {
		case "title":
			if s, ok := value.(string); ok {
				n.title = strings.TrimSpace(s)
			}
		case "tags", "tag":
			n.tags = append(n.tags, importTags(value)...)
		case "created", "date", "created_at":
			if t, ok := importTime(value); ok {
				n.created = t
			}
		case "updated", "modified", "updated_at", "last_modified":
			if t, ok := importTime(value); ok {
				n.updated = t
			}
		case "path", "slug":
			// Schist's own fields; the import decides where the note goes.
		default:
			if serializer.IsKnownField(key) {
				continue // another spelling of a field handled above
			}
			if n.properties == nil {
				n.properties = map[string]any{}
			}
			n.properties[key] = serializer.NormalizeValue(value)
		}
	}
	n.tags = uniqueStrings(n.tags)
}

// importTags accepts a YAML list or a comma/space separated string, and drops
// a leading '#'.
func importTags(value any) []string {
	var raw []string
	switch v := value.(type) {
	case string:
		raw = strings.FieldsFunc(v, func(r rune) bool { return r == ',' || unicode.IsSpace(r) })
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				raw = append(raw, s)
			}
		}
	}
	var tags []string
	for _, t := range raw {
		if t = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(t), "#")); t != "" {
			tags = append(tags, t)
		}
	}
	return tags
}

func importTime(value any) (time.Time, bool) {
	switch v := value.(type) {
	case time.Time:
		return v, true
	case string:
		for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02 15:04", "2006-01-02"} {
			if t, err := time.Parse(layout, strings.TrimSpace(v)); err == nil {
				return t, true
			}
		}
	}
	return time.Time{}, false
}

func uniqueStrings(in []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

func firstHeading(body string) string {
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			if t := strings.TrimSpace(strings.TrimPrefix(line, "# ")); t != "" {
				return t
			}
		}
	}
	return ""
}

// segment is a stretch of markdown that is either inside a fenced code block
// (left alone) or not.
type segment struct {
	text string
	code bool
	lang string
}

var fenceLine = regexp.MustCompile("^\\s*(```|~~~)\\s*([\\w-]*)")

// splitFences cuts markdown into fenced-code and prose segments.
func splitFences(body string) []segment {
	var segments []segment
	var current strings.Builder
	inFence, marker, lang := false, "", ""

	flush := func(code bool) {
		if current.Len() > 0 {
			segments = append(segments, segment{text: current.String(), code: code, lang: lang})
			current.Reset()
		}
	}
	for _, line := range strings.SplitAfter(body, "\n") {
		m := fenceLine.FindStringSubmatch(line)
		switch {
		case !inFence && m != nil:
			flush(false)
			inFence, marker, lang = true, m[1], strings.ToLower(m[2])
			current.WriteString(line)
		case inFence && m != nil && m[1] == marker && m[2] == "":
			current.WriteString(line)
			flush(true)
			inFence, lang = false, ""
		default:
			current.WriteString(line)
		}
	}
	flush(inFence)
	return segments
}

// pluginFences are code blocks that only an Obsidian plugin can run.
var pluginFences = map[string]string{
	"dataview": "Dataview", "dataviewjs": "Dataview", "tasks": "Tasks", "query": "search",
	"button": "Buttons", "meta-bind": "Meta Bind", "meta-bind-button": "Meta Bind",
}

var (
	importComment      = regexp.MustCompile(`(?s)%%.*?%%`)
	importTemplater    = regexp.MustCompile(`(?s)<%[-_*~]?.*?[-_]?%>`)
	importInlineQuery  = regexp.MustCompile("`\\$?=[^`\\n]*`")
	importBlockID      = regexp.MustCompile(`(?m)(?:[ \t]+\^[A-Za-z0-9-]+[ \t]*$|^\^[A-Za-z0-9-]+[ \t]*(?:\n|$))`)
	importCallout      = regexp.MustCompile(`(?m)^([ \t]*(?:>[ \t]*)+)\[!([A-Za-z-]+)\][+-]?[ \t]*(.*)$`)
	importEmbed        = regexp.MustCompile(`!\[\[([^\[\]|]+?)(?:\|[^\[\]]*)?\]\]`)
	importImageExt     = regexp.MustCompile(`(?i)\.(png|jpe?g|gif|svg|webp|bmp|avif|pdf|mp4|webm|mov|mp3|wav|ogg)$`)
	importBlankRuns    = regexp.MustCompile(`\n{3,}`)
	importInlineCode   = regexp.MustCompile("`[^`\\n]+`")
	importMaskedMarker = regexp.MustCompile("\x00(\\d+)\x00")
)

// convertObsidianMarkdown removes or rewrites plugin syntax outside code
// blocks and appends what it did to notes.
func convertObsidianMarkdown(body string, notes []string) (string, []string) {
	counts := map[string]int{}
	var out strings.Builder
	for _, seg := range splitFences(body) {
		if seg.code {
			if name, ok := pluginFences[seg.lang]; ok {
				counts["removed "+name+" query"]++
				continue
			}
			out.WriteString(seg.text)
			continue
		}
		text := seg.text
		text = replaceCounting(importComment, text, "", counts, "removed comment")
		text = replaceCounting(importTemplater, text, "", counts, "removed Templater tag")
		text = replaceCounting(importInlineQuery, text, "", counts, "removed inline Dataview query")
		text = replaceCounting(importBlockID, text, "", counts, "removed block ID")
		text = importCallout.ReplaceAllStringFunc(text, func(m string) string {
			counts["converted callout"]++
			p := importCallout.FindStringSubmatch(m)
			label := calloutLabel(p[2])
			if title := strings.TrimSpace(p[3]); title != "" {
				return p[1] + "**" + label + ":** " + title
			}
			return p[1] + "**" + label + "**"
		})
		text = importEmbed.ReplaceAllStringFunc(text, func(m string) string {
			target := strings.TrimSpace(importEmbed.FindStringSubmatch(m)[1])
			if importImageExt.MatchString(target) {
				counts["embedded file not imported"]++
				return "*[" + path.Base(target) + "]*"
			}
			counts["converted embed to link"]++
			return "[[" + target + "]]"
		})
		out.WriteString(text)
	}

	keys := make([]string, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		notes = append(notes, plural(counts[k], k))
	}
	return importBlankRuns.ReplaceAllString(out.String(), "\n\n"), notes
}

func replaceCounting(re *regexp.Regexp, text, with string, counts map[string]int, label string) string {
	return re.ReplaceAllStringFunc(text, func(string) string {
		counts[label]++
		return with
	})
}

func calloutLabel(kind string) string {
	kind = strings.ReplaceAll(strings.ToLower(kind), "-", " ")
	if kind == "" {
		return "Note"
	}
	return strings.ToUpper(kind[:1]) + kind[1:]
}

func plural(n int, label string) string {
	if n == 1 {
		return "1 × " + label
	}
	return fmt.Sprintf("%d × %s", n, label)
}

// importLinkIndex finds the Schist title of a link target: by relative path,
// file name or title, all case-insensitive. One index holds the files of the
// import, another the pages already in the wiki (see rewriteImportLinks).
type importLinkIndex map[string]string

// add indexes a file of the import by its path inside the import.
func (idx importLinkIndex) add(relPath, title string) {
	noExt := strings.ToLower(strings.TrimSuffix(relPath, path.Ext(relPath)))
	idx.addKeys(title, noExt, path.Base(noExt), utils.GenerateSlug(path.Base(noExt)), strings.ToLower(title))
}

// addPage indexes a page already in the wiki by its full path, its path
// relative to the import's target folder, its page name and its title.
func (idx importLinkIndex) addPage(pagePath, title, targetPath string) {
	full := strings.ToLower(strings.Trim(pagePath, "/"))
	keys := []string{full}
	if target := strings.ToLower(strings.Trim(targetPath, "/")); target != "" && strings.HasPrefix(full, target+"/") {
		keys = append(keys, strings.TrimPrefix(full, target+"/"))
	}
	keys = append(keys, path.Base(full), strings.ToLower(title))
	idx.addKeys(title, keys...)
}

func (idx importLinkIndex) addKeys(title string, keys ...string) {
	for _, key := range keys {
		if _, taken := idx[key]; !taken && key != "" {
			idx[key] = title
		}
	}
}

func (idx importLinkIndex) lookup(target string) (string, bool) {
	t := strings.ToLower(strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(target), ".md")))
	t = strings.TrimPrefix(t, "/")
	for _, key := range []string{t, path.Base(t), utils.GenerateSlug(path.Base(t))} {
		if title, ok := idx[key]; ok {
			return title, true
		}
	}
	return "", false
}

// lookupImportLink asks each index in turn, so the import's own files win
// over pages already in the wiki.
func lookupImportLink(indexes []importLinkIndex, target string) (string, bool) {
	for _, idx := range indexes {
		if title, ok := idx.lookup(target); ok {
			return title, true
		}
	}
	return "", false
}

var (
	importWikiLink = regexp.MustCompile(`\[\[([^\[\]|]*?)(?:\|([^\[\]]*))?\]\]`)
	importMdLink   = regexp.MustCompile(`\[([^\]]*)\]\(([^)\s]+?\.md)(#[^)\s]*)?\)`)
)

// rewriteImportLinks turns [[file#heading|alias]] and [text](file.md) links
// into [[Title|text]] links that resolve in Schist. relDir is the directory of
// the note inside the import, for relative markdown links. Inline code and
// fenced code are left alone. Targets are looked up in indexes in order.
func rewriteImportLinks(body, relDir string, indexes ...importLinkIndex) (string, int) {
	unresolved := 0
	var out strings.Builder
	for _, seg := range splitFences(body) {
		if seg.code {
			out.WriteString(seg.text)
			continue
		}
		text, masked := maskInlineCode(seg.text)

		text = importWikiLink.ReplaceAllStringFunc(text, func(m string) string {
			p := importWikiLink.FindStringSubmatch(m)
			// In a table Obsidian escapes the alias pipe: [[target\|alias]].
			// Keep it escaped, or the link splits the table cell.
			raw, sep := p[1], "|"
			if strings.HasSuffix(raw, `\`) {
				raw, sep = strings.TrimSuffix(raw, `\`), `\|`
			}
			target, heading, _ := strings.Cut(raw, "#")
			alias := strings.TrimSpace(p[2])
			target = strings.TrimSpace(target)
			if target == "" { // [[#heading]]: a link within the page
				if alias != "" {
					return alias
				}
				return strings.TrimSpace(heading)
			}
			title, ok := lookupImportLink(indexes, target)
			if !ok {
				unresolved++
				title = path.Base(target)
			}
			if alias == "" && heading != "" {
				alias = path.Base(target) + " › " + strings.TrimSpace(heading)
			}
			if alias == "" || alias == title {
				return "[[" + title + "]]"
			}
			return "[[" + title + sep + alias + "]]"
		})

		text = importMdLink.ReplaceAllStringFunc(text, func(m string) string {
			p := importMdLink.FindStringSubmatch(m)
			target := p[2]
			if strings.Contains(target, "://") {
				return m
			}
			target = strings.ReplaceAll(target, "%20", " ")
			resolved := path.Clean(path.Join(relDir, target))
			title, ok := lookupImportLink(indexes, resolved)
			if !ok {
				title, ok = lookupImportLink(indexes, target)
			}
			if !ok {
				unresolved++
				return m
			}
			label := strings.TrimSpace(p[1])
			if label == "" || label == title {
				return "[[" + title + "]]"
			}
			return "[[" + title + "|" + label + "]]"
		})

		out.WriteString(unmaskInlineCode(text, masked))
	}
	return out.String(), unresolved
}

func maskInlineCode(text string) (string, []string) {
	var spans []string
	masked := importInlineCode.ReplaceAllStringFunc(text, func(m string) string {
		spans = append(spans, m)
		return fmt.Sprintf("\x00%d\x00", len(spans)-1)
	})
	return masked, spans
}

func unmaskInlineCode(text string, spans []string) string {
	return importMaskedMarker.ReplaceAllStringFunc(text, func(m string) string {
		var i int
		fmt.Sscanf(importMaskedMarker.FindStringSubmatch(m)[1], "%d", &i)
		return spans[i]
	})
}

// importPageSlug is the last path segment of an imported note: its file name,
// as in Obsidian, where `router.md` is linked as [[router]] whatever its
// heading says. A file name with nothing usable in it falls back to the title.
func importPageSlug(relPath, title string) string {
	name := strings.TrimSuffix(path.Base(relPath), path.Ext(relPath))
	if slug := utils.GenerateSlug(name); slug != "untitled" || strings.EqualFold(name, "untitled") {
		return slug
	}
	return utils.GenerateSlug(title)
}

// importFolderPath maps a folder of the import to a Schist path segment by
// segment: hidden folders lose their dot (.agents → agents), names become
// slugs.
func importFolderPath(relDir string) string {
	var parts []string
	for _, seg := range strings.Split(relDir, "/") {
		seg = strings.TrimLeft(seg, ".")
		if seg == "" {
			continue
		}
		parts = append(parts, slugifySegment(seg))
	}
	return strings.Join(parts, "/")
}

// skippedImportDirs are tool folders that never hold notes.
var skippedImportDirs = map[string]bool{".obsidian": true, ".git": true, ".trash": true, ".github": true, "node_modules": true}

func importSkipReason(relPath string) string {
	for _, seg := range strings.Split(path.Dir(relPath), "/") {
		if skippedImportDirs[strings.ToLower(seg)] {
			return "skipped folder " + seg
		}
	}
	if strings.HasPrefix(path.Base(relPath), ".") {
		return "hidden file"
	}
	return ""
}

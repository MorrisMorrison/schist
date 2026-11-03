package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type editIn struct {
	Path       string `json:"path"`
	OldText    string `json:"old_text,omitempty" jsonschema:"exact text to replace, copied from read_document (whitespace and line breaks must match); it must occur once unless replace_all is set"`
	NewText    string `json:"new_text" jsonschema:"replacement markdown; empty deletes the matched text or clears the section"`
	ReplaceAll bool   `json:"replace_all,omitempty" jsonschema:"replace every occurrence of old_text instead of failing when it occurs more than once"`
	Heading    string `json:"heading,omitempty" jsonschema:"instead of old_text: replace the whole section under this heading (its text, without #s), up to the next heading of the same or a higher level; the heading line itself is kept"`
}

type editOut struct {
	Path         string `json:"path"`
	Title        string `json:"title"`
	Message      string `json:"message"`
	Replacements int    `json:"replacements" jsonschema:"how many places changed"`
	Lines        []int  `json:"lines,omitempty" jsonschema:"line numbers (1-based) in the new content where each change starts"`
}

func (t *tools) editDocument(_ context.Context, _ *mcp.CallToolRequest, in editIn) (*mcp.CallToolResult, editOut, error) {
	bySection := strings.TrimSpace(in.Heading) != ""
	switch {
	case in.OldText == "" && !bySection:
		return nil, editOut{}, errors.New("pass old_text or heading: the snippet or the section to replace")
	case in.OldText != "" && bySection:
		return nil, editOut{}, errors.New("pass old_text or heading, not both")
	case bySection && in.ReplaceAll:
		return nil, editOut{}, errors.New("replace_all only applies to old_text")
	}

	p := documentPath(in.Path)
	doc, err := t.svc.DocumentService.GetDocumentByPath(p)
	if err != nil {
		return nil, editOut{}, toolError(err)
	}

	var content, message string
	var lines []int
	if bySection {
		var line int
		content, line, err = replaceSection(doc.Content, in.Heading, in.NewText)
		if err != nil {
			return nil, editOut{}, err
		}
		lines = []int{line}
		message = fmt.Sprintf("Replaced the section under %q in %s (from line %d)", pageHeading(doc.Content, in.Heading), p, line)
	} else {
		content, lines, err = replaceSnippet(doc.Content, in.OldText, in.NewText, in.ReplaceAll)
		if err != nil {
			return nil, editOut{}, fmt.Errorf("%w in %s", err, p)
		}
		message = fmt.Sprintf("Replaced %s in %s (%s %s)", plural(len(lines), "match", "matches"), p,
			pluralWord(len(lines), "line", "lines"), joinInts(lines))
	}

	out := editOut{Path: p, Title: doc.MetaData.Title, Replacements: len(lines), Lines: lines}
	if content == doc.Content {
		out.Message = "No change: the new text is the same as the old"
		out.Replacements, out.Lines = 0, nil
		return nil, out, nil
	}
	doc.Content = content
	if _, _, err := t.save(doc, ""); err != nil {
		return nil, editOut{}, err
	}
	out.Message = message
	return nil, out, nil
}

// replaceSnippet replaces old with replacement and returns the 1-based line
// in the result where each replacement starts. old must occur exactly once
// unless all is set, so an edit never lands somewhere the caller didn't mean.
func replaceSnippet(content, old, replacement string, all bool) (string, []int, error) {
	count := strings.Count(content, old)
	if count == 0 {
		return "", nil, errors.New("old_text not found; copy it exactly from read_document (whitespace and line breaks must match)")
	}
	if count > 1 && !all {
		return "", nil, fmt.Errorf("old_text matches %d times; include more surrounding text to pick one, or set replace_all", count)
	}

	var b strings.Builder
	lines := make([]int, 0, count)
	line, rest := 1, content
	for {
		i := strings.Index(rest, old)
		if i < 0 {
			break
		}
		b.WriteString(rest[:i])
		line += strings.Count(rest[:i], "\n")
		lines = append(lines, line)
		b.WriteString(replacement)
		line += strings.Count(replacement, "\n")
		rest = rest[i+len(old):]
	}
	b.WriteString(rest)
	return b.String(), lines, nil
}

// replaceSection replaces the body of the section under heading (up to the
// next heading of the same or a higher level) and returns the 1-based line
// where the new body starts. The heading must occur exactly once.
func replaceSection(content, heading, replacement string) (string, int, error) {
	lines := strings.Split(content, "\n")
	start, end, err := findSection(lines, heading, true)
	if err != nil {
		return "", 0, err
	}

	head := strings.Join(lines[:start+1], "\n")
	rest := lines[end:]
	for len(rest) > 0 && strings.TrimSpace(rest[0]) == "" {
		rest = rest[1:]
	}
	body := strings.Trim(replacement, "\n")

	var b strings.Builder
	b.WriteString(head)
	b.WriteString("\n\n")
	line := start + 3
	if body != "" {
		b.WriteString(body)
		b.WriteString("\n")
		if len(rest) > 0 {
			b.WriteString("\n")
		}
	} else {
		line = start + 2
	}
	b.WriteString(strings.Join(rest, "\n"))
	result := b.String()
	if body == "" && len(rest) == 0 {
		result = head + "\n"
	}
	return result, line, nil
}

// findSection returns the heading's line and the end (exclusive) of its
// section: the next heading of the same or a higher level, or the end of the
// page. Headings inside code fences don't count. With unique set, a heading
// that occurs more than once is an error; otherwise the first one is used.
func findSection(lines []string, heading string, unique bool) (int, int, error) {
	want := strings.ToLower(headingText(heading))
	start, level, matches := -1, 0, 0
	inFence := false
	for i, line := range lines {
		if isFence(line) {
			inFence = !inFence
		}
		if inFence {
			continue
		}
		if l, text := headingLine(line); l > 0 && strings.ToLower(text) == want {
			matches++
			if start < 0 {
				start, level = i, l
			}
		}
	}
	if start < 0 {
		return 0, 0, fmt.Errorf("no heading %q in this page", headingText(heading))
	}
	if unique && matches > 1 {
		return 0, 0, fmt.Errorf("heading %q appears %d times in this page; use old_text to pick the part to change", headingText(heading), matches)
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
	return start, end, nil
}

// pageHeading returns a heading as the page writes it, for messages.
func pageHeading(content, heading string) string {
	lines := strings.Split(content, "\n")
	if start, _, err := findSection(lines, heading, false); err == nil {
		_, text := headingLine(lines[start])
		return text
	}
	return headingText(heading)
}

// headingText is a heading argument without its #s.
func headingText(heading string) string {
	return strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(heading), "#"))
}

func plural(n int, one, many string) string {
	return fmt.Sprintf("%d %s", n, pluralWord(n, one, many))
}

func pluralWord(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

func joinInts(values []int) string {
	parts := make([]string, len(values))
	for i, v := range values {
		parts[i] = fmt.Sprint(v)
	}
	return strings.Join(parts, ", ")
}

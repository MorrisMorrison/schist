package services

import "strings"

// Inline hashtags follow the frontend's rules (frontend/src/lib/utils:
// hashtag-constants.ts, hashtag-renderer.ts) so a page gets the same tags
// whether it is saved from the editor, the API, the MCP or an import:
//   - only prose counts: fenced code blocks (``` or ~~~, any length, an
//     unclosed fence runs to the end) and inline code spans are skipped;
//   - a tag starts a word: at the start, or after whitespace, an opening
//     bracket or a quote, so `fill:#fff`, `page#install` and `a#b` are not tags;
//   - a tag is one or more ASCII letters, digits, '_' or '-'.

// extractHashtags returns the inline #tags in markdown content, without the
// '#', deduplicated, in order of first appearance. It returns nil when there
// are none.
func extractHashtags(content string) []string {
	var tags []string
	seen := map[string]bool{}
	forEachProse(content, func(prose string) {
		for _, tag := range hashtagsIn(prose) {
			if !seen[tag] {
				seen[tag] = true
				tags = append(tags, tag)
			}
		}
	})
	return tags
}

// mergeTags returns explicit followed by the extra tags it doesn't already
// have, without duplicates. With no extra tags, explicit comes back untouched.
func mergeTags(explicit, extra []string) []string {
	if len(extra) == 0 {
		return explicit
	}
	var out []string
	seen := map[string]bool{}
	for _, list := range [][]string{explicit, extra} {
		for _, tag := range list {
			if !seen[tag] {
				seen[tag] = true
				out = append(out, tag)
			}
		}
	}
	return out
}

func hashtagsIn(prose string) []string {
	var tags []string
	for i := 0; i < len(prose); i++ {
		if prose[i] != '#' || (i > 0 && !startsTag(prose[i-1])) {
			continue
		}
		end := i + 1
		for end < len(prose) && isTagChar(prose[end]) {
			end++
		}
		if end > i+1 {
			tags = append(tags, prose[i+1:end])
		}
		i = end - 1
	}
	return tags
}

func startsTag(prev byte) bool {
	switch prev {
	case ' ', '\t', '\n', '\r', '\f', '\v', '(', '[', '"', '\'':
		return true
	}
	return false
}

func isTagChar(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-'
}

// forEachProse calls fn with each run of markdown prose: the text outside
// fenced code blocks, split around inline code spans.
func forEachProse(markdown string, fn func(prose string)) {
	var prose []string
	fence := ""
	flush := func() {
		if len(prose) > 0 {
			forEachOutsideInlineCode(strings.Join(prose, "\n"), fn)
			prose = nil
		}
	}
	for _, line := range strings.Split(markdown, "\n") {
		marker := fenceMarker(line)
		if fence == "" {
			if marker != "" {
				flush()
				fence = marker
			} else {
				prose = append(prose, line)
			}
			continue
		}
		// A fence closes with the same character, at least as long, and
		// nothing after it.
		if marker != "" && marker[0] == fence[0] && len(marker) >= len(fence) && strings.TrimSpace(line) == marker {
			fence = ""
		}
	}
	flush()
}

// fenceMarker returns the run of 3+ backticks or tildes that opens a line
// (after up to three spaces), or "".
func fenceMarker(line string) string {
	i := 0
	for i < 3 && i < len(line) && line[i] == ' ' {
		i++
	}
	if i >= len(line) || (line[i] != '`' && line[i] != '~') {
		return ""
	}
	c, start := line[i], i
	for i < len(line) && line[i] == c {
		i++
	}
	if i-start < 3 {
		return ""
	}
	return line[start:i]
}

// forEachOutsideInlineCode calls fn with the text around inline code spans. A
// span opens with a run of backticks and closes with the next run of the same
// length; a run with no match is literal text.
func forEachOutsideInlineCode(text string, fn func(prose string)) {
	last := 0
	for i := 0; i < len(text); {
		if text[i] != '`' {
			i++
			continue
		}
		open := backtickRun(text, i)
		closeAt := -1
		for j := i + open; j < len(text); {
			if text[j] != '`' {
				j++
				continue
			}
			run := backtickRun(text, j)
			if run == open {
				closeAt = j
				break
			}
			j += run
		}
		if closeAt < 0 {
			i += open
			continue
		}
		fn(text[last:i])
		i = closeAt + open
		last = i
	}
	fn(text[last:])
}

func backtickRun(text string, i int) int {
	n := 0
	for i+n < len(text) && text[i+n] == '`' {
		n++
	}
	return n
}

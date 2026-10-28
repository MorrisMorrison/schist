package services

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMarkdownToPlainText(t *testing.T) {
	md := strings.Join([]string{
		"# Title here #",
		"",
		"Some **bold**, _plain_ and `code` with a [link](https://x.test) and ![alt text](img.png).",
		"- [ ] a task",
		"1. numbered",
		"> quoted [[Other Page]] and [[target|label]]",
		"---",
		"| col a | col b |",
		"```go",
		"func main() {}",
		"```",
		"<span>html</span>",
	}, "\n")

	text, headings := markdownToPlainText(md)

	assert.Equal(t, []string{"Title here"}, headings)
	assert.Equal(t, "Title here Some bold, _plain_ and code with a link and alt text. a task numbered "+
		"quoted Other Page and label col a col b func main() {} html", text)
}

func snippetString(segs []SnippetSegment) string {
	var b strings.Builder
	for _, s := range segs {
		if s.Match {
			b.WriteString("[" + s.Text + "]")
		} else {
			b.WriteString(s.Text)
		}
	}
	return b.String()
}

func entryWithBody(body string) *searchEntry {
	return &searchEntry{body: []rune(body), bodyLow: lowerRunes(body), titleLow: lowerRunes("t")}
}

func TestSnippet_WindowsAroundTheMatchWithEllipses(t *testing.T) {
	body := strings.Repeat("lorem ipsum ", 20) + "the needle sits here " + strings.Repeat("dolor sit ", 30)
	e := entryWithBody(body)

	got := snippetString(e.matchSnippet([][]rune{[]rune("needle")}, []rune("needle")))

	assert.True(t, strings.HasPrefix(got, "…"), got)
	assert.True(t, strings.HasSuffix(got, "…"), got)
	assert.Contains(t, got, "the [needle] sits here")
	assert.LessOrEqual(t, len([]rune(got)), snippetLength+2)
	assert.NotContains(t, got, "…orem", "cut at a word boundary")
}

func TestSnippet_MarksEveryTermAndHandlesMultibyteText(t *testing.T) {
	e := entryWithBody("Größe und Übersicht: die größte Übersicht.")

	got := snippetString(e.matchSnippet([][]rune{lowerRunes("größ"), lowerRunes("ÜBER")}, lowerRunes("größ über")))

	assert.Equal(t, "[Größ]e und [Über]sicht: die [größ]te [Über]sicht.", got)
}

func TestSnippet_LeadWhenTheBodyDidNotMatch(t *testing.T) {
	assert.Equal(t, "Short body.", snippetString(entryWithBody("Short body.").leadSnippet()))
	assert.Nil(t, entryWithBody("").leadSnippet())
}

func TestWordPrefixMatching(t *testing.T) {
	text := lowerRunes("re-release notes, C++ and #tags")
	assert.True(t, hasWordPrefix(text, lowerRunes("release")), "after a hyphen")
	assert.False(t, hasWordPrefix(text, lowerRunes("lease")))
	assert.True(t, hasWordPrefix(text, lowerRunes("c++")))
	assert.True(t, hasWordPrefix(text, lowerRunes("#tag")), "a term starting with a symbol matches anywhere")
	assert.Equal(t, 2, countWordPrefix(lowerRunes("go go gopher"), lowerRunes("go"), 2), "count stops at the limit")
}

func TestIsCompactSubsequence(t *testing.T) {
	assert.True(t, isCompactSubsequence([]rune("gtst"), []rune("getting started")))
	assert.True(t, isCompactSubsequence([]rune("gs"), []rune("getting started")), "initials")
	assert.True(t, isCompactSubsequence([]rune("dc"), []rune("the deployment checklist")), "from a later word start")
	assert.False(t, isCompactSubsequence([]rune("gtst"), []rune("meeting notes template")), "not from mid-word")
	assert.False(t, isCompactSubsequence([]rune("ab"), []rune("a very long way to b")), "too spread out")
	assert.False(t, isCompactSubsequence([]rune("tsg"), []rune("getting started")))
	assert.False(t, isCompactSubsequence(nil, []rune("anything")))
}

func TestMarkdownToPlainText_WikiLinkAfterLiteralBrackets(t *testing.T) {
	text, _ := markdownToPlainText("Type `[[` and a title, like [[Writing style]] or [[Deploy|deploys]].")
	assert.Equal(t, "Type [[ and a title, like Writing style or deploys.", text)
}

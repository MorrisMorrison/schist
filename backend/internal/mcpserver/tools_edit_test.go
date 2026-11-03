package mcpserver

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTools_EditDocument_ReplacesSnippet(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/plan", "Plan", "# Plan\n\n- ship on Friday\n- tell the team\n", "work")
	cs := connect(t, svc, true)

	res := call(t, cs, "edit_document", map[string]any{
		"path": "/plan", "old_text": "ship on Friday", "new_text": "ship on Monday",
	})
	var out editOut
	structured(t, res, &out)
	assert.Equal(t, "/plan", out.Path)
	assert.Equal(t, 1, out.Replacements)
	assert.Equal(t, []int{3}, out.Lines)
	assert.Contains(t, out.Message, "Replaced 1 match in /plan (line 3)")

	doc, err := svc.DocumentService.GetDocumentByPath("/plan")
	require.NoError(t, err)
	assert.Equal(t, "# Plan\n\n- ship on Monday\n- tell the team\n", doc.Content)
	assert.Equal(t, []string{"work"}, doc.MetaData.Tags, "title and tags are kept")

	versions, err := svc.DocumentService.GetDocumentVersions("/plan")
	require.NoError(t, err)
	assert.Len(t, versions, 2, "the edit is a git commit")
}

func TestTools_EditDocument_Ambiguity(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/todo", "Todo", "- [ ] a\n- [ ] b\n- [x] c\n")
	cs := connect(t, svc, true)

	requireToolError(t, call(t, cs, "edit_document", map[string]any{
		"path": "/todo", "old_text": "- [ ]", "new_text": "- [x]",
	}), "matches 2 times")
	doc, err := svc.DocumentService.GetDocumentByPath("/todo")
	require.NoError(t, err)
	assert.Equal(t, "- [ ] a\n- [ ] b\n- [x] c\n", doc.Content, "nothing changes on an ambiguous match")

	var out editOut
	structured(t, call(t, cs, "edit_document", map[string]any{
		"path": "/todo", "old_text": "- [ ]", "new_text": "- [x]", "replace_all": true,
	}), &out)
	assert.Equal(t, 2, out.Replacements)
	assert.Equal(t, []int{1, 2}, out.Lines)
	doc, err = svc.DocumentService.GetDocumentByPath("/todo")
	require.NoError(t, err)
	assert.Equal(t, "- [x] a\n- [x] b\n- [x] c\n", doc.Content)
}

func TestTools_EditDocument_ReplacesSection(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/log", "Log", "# Log\n\n## Monday\n\n- coffee\n- more coffee\n\n### Notes\n\nsleepy\n\n## Tuesday\n\n- tea\n")
	cs := connect(t, svc, true)

	var out editOut
	structured(t, call(t, cs, "edit_document", map[string]any{
		"path": "/log", "heading": "## monday", "new_text": "- water",
	}), &out)
	assert.Equal(t, 1, out.Replacements)
	assert.Equal(t, []int{5}, out.Lines)
	assert.Contains(t, out.Message, `Replaced the section under "Monday"`)

	doc, err := svc.DocumentService.GetDocumentByPath("/log")
	require.NoError(t, err)
	assert.Equal(t, "# Log\n\n## Monday\n\n- water\n\n## Tuesday\n\n- tea\n", doc.Content,
		"the section runs to the next heading of the same level, subsections included")

	structured(t, call(t, cs, "edit_document", map[string]any{"path": "/log", "heading": "Tuesday", "new_text": ""}), &out)
	doc, err = svc.DocumentService.GetDocumentByPath("/log")
	require.NoError(t, err)
	assert.Equal(t, "# Log\n\n## Monday\n\n- water\n\n## Tuesday\n", doc.Content, "an empty new_text clears the section")
}

func TestTools_EditDocument_Errors(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/page", "Page", "## Same\n\none\n\n## Same\n\ntwo\n")
	cs := connect(t, svc, true)

	cases := []struct {
		name string
		args map[string]any
		want string
	}{
		{"missing snippet", map[string]any{"path": "/page", "old_text": "three", "new_text": "x"}, "not found"},
		{"neither mode", map[string]any{"path": "/page", "new_text": "x"}, "old_text or heading"},
		{"both modes", map[string]any{"path": "/page", "old_text": "one", "heading": "Same", "new_text": "x"}, "not both"},
		{"duplicate heading", map[string]any{"path": "/page", "heading": "Same", "new_text": "x"}, "appears 2 times"},
		{"missing heading", map[string]any{"path": "/page", "heading": "Other", "new_text": "x"}, `no heading "Other"`},
		{"replace_all with heading", map[string]any{"path": "/page", "heading": "Same", "new_text": "x", "replace_all": true}, "replace_all"},
		{"missing page", map[string]any{"path": "/missing", "old_text": "a", "new_text": "b"}, "not found"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			requireToolError(t, call(t, cs, "edit_document", c.args), c.want)
		})
	}

	doc, err := svc.DocumentService.GetDocumentByPath("/page")
	require.NoError(t, err)
	assert.Equal(t, "## Same\n\none\n\n## Same\n\ntwo\n", doc.Content)
}

func TestTools_EditDocument_NoChangeIsNotCommitted(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/same", "Same", "hello world\n")
	cs := connect(t, svc, true)

	var out editOut
	structured(t, call(t, cs, "edit_document", map[string]any{"path": "/same", "old_text": "world", "new_text": "world"}), &out)
	assert.Contains(t, out.Message, "No change")

	versions, err := svc.DocumentService.GetDocumentVersions("/same")
	require.NoError(t, err)
	assert.Len(t, versions, 1)
}

func TestReplaceSection(t *testing.T) {
	cases := []struct {
		name, content, heading, replacement, want string
		line                                      int
	}{
		{"last section", "# A\n\none\n", "A", "two", "# A\n\ntwo\n", 3},
		{"stops at same level", "## A\none\n## B\ntwo", "A", "new", "## A\n\nnew\n\n## B\ntwo", 3},
		{"stops at higher level", "### A\none\n## B", "A", "new", "### A\n\nnew\n\n## B", 3},
		{"ignores headings in code", "## A\n```\n## B\n```\n## C", "A", "new", "## A\n\nnew\n\n## C", 3},
		{"empty section", "## A\n## B", "A", "new", "## A\n\nnew\n\n## B", 3},
		{"clear", "## A\n\none\n\n## B", "A", "", "## A\n\n## B", 2},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, line, err := replaceSection(c.content, c.heading, c.replacement)
			require.NoError(t, err)
			assert.Equal(t, c.want, got)
			assert.Equal(t, c.line, line)
		})
	}
}

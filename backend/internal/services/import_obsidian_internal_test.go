package services

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestParseImportedMarkdown_FrontMatter(t *testing.T) {
	note := parseImportedMarkdown(strings.Join([]string{
		"---",
		"title: Server notes",
		"tags: [homelab, '#infra']",
		"status: active",
		"created: 2025-03-04",
		"updated: 2026-01-02T10:00:00Z",
		"host: \"[[docki]]\"",
		"path: /somewhere/else",
		"network:",
		"  vlan: 10",
		"---",
		"# Heading",
		"",
		"Body.",
	}, "\n"), "notes/server.md")

	assert.Equal(t, "Server notes", note.title, "front matter title wins over the H1")
	assert.Equal(t, []string{"homelab", "infra"}, note.tags)
	assert.Equal(t, time.Date(2025, 3, 4, 0, 0, 0, 0, time.UTC), note.created)
	assert.Equal(t, time.Date(2026, 1, 2, 10, 0, 0, 0, time.UTC), note.updated)
	assert.Equal(t, "# Heading\n\nBody.", note.body)
	assert.Equal(t, map[string]any{
		"status":  "active",
		"host":    "[[docki]]",
		"network": map[string]any{"vlan": 10},
	}, note.properties, "other keys are kept as properties; Schist's own path is not taken over")
	assert.Empty(t, note.notes, "nothing is dropped")
}

func TestParseImportedMarkdown_TitlesAndOddFrontMatter(t *testing.T) {
	assert.Equal(t, "From H1", parseImportedMarkdown("# From H1\n\ntext", "x.md").title)
	assert.Equal(t, "file-name", parseImportedMarkdown("no heading", "a/file-name.md").title)
	// Quoted: unquoted, YAML reads " #b c" as a comment.
	assert.Equal(t, []string{"a", "b", "c"}, parseImportedMarkdown("---\ntags: 'a, #b c'\n---\nx", "x.md").tags)
	assert.Equal(t, []string{"a"}, parseImportedMarkdown("---\ntags: a, #b c\n---\nx", "x.md").tags)

	broken := parseImportedMarkdown("---\ntitle: [unclosed\n---\nkept body", "b.md")
	assert.Equal(t, "kept body", broken.body)
	assert.Contains(t, broken.notes, "front matter could not be read and was dropped")

	crlf := parseImportedMarkdown("---\r\ntitle: Windows\r\n---\r\nline one\r\nline two", "w.md")
	assert.Equal(t, "Windows", crlf.title)
	assert.Equal(t, "line one\nline two", crlf.body)
}

func TestConvertObsidianMarkdown(t *testing.T) {
	in := strings.Join([]string{
		"Intro %%hidden note%% text.",
		"",
		"```dataview",
		"TABLE status FROM #project",
		"```",
		"",
		"Created <% tp.date.now() %> today. Count: `= this.file.size`",
		"",
		"> [!warning] Careful",
		"> with this",
		"",
		"> [!tip]-",
		"> folded",
		"",
		"A paragraph ^abc123",
		"",
		"![[diagram.png]] and ![[Other note]]",
		"",
		"```go",
		"// %% not a comment %% <% kept %> ^kept",
		"```",
	}, "\n")

	out, notes := convertObsidianMarkdown(in, nil)

	assert.Equal(t, strings.Join([]string{
		"Intro  text.",
		"",
		"Created  today. Count: ",
		"",
		"> **Warning:** Careful",
		"> with this",
		"",
		"> **Tip**",
		"> folded",
		"",
		"A paragraph",
		"",
		"*[diagram.png]* and [[Other note]]",
		"",
		"```go",
		"// %% not a comment %% <% kept %> ^kept",
		"```",
	}, "\n"), out, "code blocks are left alone")
	assert.ElementsMatch(t, []string{
		"1 × converted embed to link", "2 × converted callout", "1 × embedded file not imported",
		"1 × removed Dataview query", "1 × removed Templater tag", "1 × removed block ID",
		"1 × removed comment", "1 × removed inline Dataview query",
	}, notes)
}

func TestRewriteImportLinks(t *testing.T) {
	idx := importLinkIndex{}
	idx.add("homelab/devices/docki.md", "Docki host", "/homelab/devices/docki")
	idx.add("homelab/network.md", "Network", "/homelab/network")
	idx.add("guides/setup guide.md", "Setup guide", "/guides/setup-guide")

	body := strings.Join([]string{
		"See [[docki]], [[homelab/devices/docki|the host]] and [[docki#Disks]].",
		"Also [[#Local heading]], [[#Other|named]] and [[Missing note|gone]].",
		"Markdown: [net](../network.md) [guide](../guides/setup%20guide.md#install) [web](https://x.dev/a.md)",
		"Code: `[[docki]]` stays.",
		"```",
		"[[docki]]",
		"```",
	}, "\n")

	out, unresolved := rewriteImportLinks(body, "homelab/devices", "/homelab/devices/docki", idx)

	assert.Equal(t, strings.Join([]string{
		"See [[Docki host]], [[Docki host|the host]] and [[Docki host|docki › Disks]].",
		"Also Local heading, named and [[Missing note|gone]].",
		"Markdown: [[Network|net]] [[Setup guide|guide]] [web](https://x.dev/a.md)",
		"Code: `[[docki]]` stays.",
		"```",
		"[[docki]]",
		"```",
	}, "\n"), out)
	assert.Equal(t, 1, unresolved)
}

func TestImportFolderPathAndSkips(t *testing.T) {
	assert.Equal(t, "agents/coach", importFolderPath(".agents/coach"))
	assert.Equal(t, "00-inbox/my-notes", importFolderPath("00-inbox/My Notes"))
	assert.Equal(t, "", importFolderPath("."))

	assert.Equal(t, "skipped folder .obsidian", importSkipReason(".obsidian/app.json"))
	assert.Equal(t, "skipped folder .git", importSkipReason("vault/.git/config"))
	assert.Equal(t, "hidden file", importSkipReason("notes/.gitkeep"))
	assert.Equal(t, "", importSkipReason(".agents/coach/progress.md"))
}

func TestRewriteImportLinks_EscapedPipeInTables(t *testing.T) {
	idx := importLinkIndex{}
	idx.add("homelab/zot.md", "Zot registry", "/homelab/zot")

	out, unresolved := rewriteImportLinks(`| [[zot\|Zot]] | [[zot\|Zot registry]] | [[missing\|x]] |`, "homelab", "/homelab/page", idx)

	assert.Equal(t, `| [[Zot registry\|Zot]] | [[Zot registry]] | [[missing\|x]] |`, out,
		"the pipe stays escaped so the table cell isn't split")
	assert.Equal(t, 1, unresolved)
}

func TestConvertObsidianMarkdown_PluginBlocksAndBlockIDs(t *testing.T) {
	out, notes := convertObsidianMarkdown("Intro\n\n```button\nname New\n```\n^button-bar\n\nNext ^keep-1\n", nil)

	assert.Equal(t, "Intro\n\nNext\n", out)
	assert.ElementsMatch(t, []string{"1 × removed Buttons query", "2 × removed block ID"}, notes)
}

func TestImportPageSlug(t *testing.T) {
	tests := []struct {
		name, relPath, title, want string
	}{
		{"file name, not the heading", "devices/router.md", "router — main gateway", "router"},
		{"spaces and case", "notes/Setup Guide.md", "Setting things up", "setup-guide"},
		{"file name without letters falls back to the title", "???.md", "Question marks", "question-marks"},
		{"nothing usable at all", "???.md", "", "untitled"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, importPageSlug(tt.relPath, tt.title))
		})
	}
}

func TestRewriteImportLinks_FallsBackToTheWiki(t *testing.T) {
	batch := importLinkIndex{}
	batch.add("devices/switch.md", "switch — core", "/lab/devices/switch")

	wiki := importLinkIndex{}
	wiki.addPage("/lab/devices/router", "router — main gateway", "/lab")
	wiki.addPage("/notes/setup-guide", "Setting things up", "/lab")
	wiki.addPage("/lab/devices/switch", "Old switch page", "/lab")

	out, unresolved := rewriteImportLinks(strings.Join([]string{
		"[[router]] [[devices/router|gateway]] [[/lab/devices/router]]",
		"[[Setup Guide]] [[setting things up]] [[switch]] [[nowhere]]",
	}, "\n"), "devices", "/lab/devices/page", batch, wiki)

	assert.Equal(t, strings.Join([]string{
		"[[router — main gateway]] [[router — main gateway|gateway]] [[router — main gateway]]",
		"[[Setting things up]] [[Setting things up]] [[switch — core]] [[nowhere]]",
	}, "\n"), out, "the import's own files win over pages already in the wiki")
	assert.Equal(t, 1, unresolved)
}

// #333: a title other pages also have stays a title link when it finds the
// page from where it's written (the nearest folder), and becomes a path link,
// with the text as written (or the title) as its label, when it doesn't.
func TestRewriteImportLinks_DuplicateTitlesBecomePathLinks(t *testing.T) {
	batch := importLinkIndex{}
	batch.add("a/overview.md", "Overview", "/second/a/overview")
	batch.add("switch.md", "Core switch", "/second/switch")
	wiki := importLinkIndex{}
	wiki.addPage("/second/b/overview", "Overview", "/second")
	markDuplicateTitles(batch, wiki)
	links := "[[a/overview]] [[a/overview|start]] [[switch]] [o](a/overview.md)"

	near, _ := rewriteImportLinks(links, "", "/second/a/plan", batch, wiki)
	assert.Equal(t, "[[Overview]] [[Overview|start]] [[Core switch]] [[Overview|o]]", near,
		"from /second/a the title finds /second/a/overview")

	far, unresolved := rewriteImportLinks(links, "", "/second/c/plan", batch, wiki)
	assert.Equal(t, "[[/second/a/overview|Overview]] [[/second/a/overview|start]] [[Core switch]] [[/second/a/overview|o]]", far,
		"from /second/c both overviews are as near")
	assert.Equal(t, 0, unresolved)
}

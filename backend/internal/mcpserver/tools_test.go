package mcpserver

import (
	"context"
	"encoding/json"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestServices(t *testing.T) *services.Services {
	t.Helper()
	t.Setenv("ENV", "development")
	t.Setenv("SCHIST_DATA_DIR", t.TempDir())
	t.Setenv("SCHIST_JWT_SECRET", "mcp-test-secret-that-is-long-enough-0123456789") // gitleaks:allow
	t.Setenv("SCHIST_AUTH_ENABLED", "false")
	t.Setenv("SCHIST_TEMPLATES_DIR", filepath.Join("..", "..", "..", "templates"))
	svc, err := services.NewServices()
	require.NoError(t, err)
	return svc
}

// connect runs an MCP server over an in-memory transport and returns a client
// session to it.
func connect(t *testing.T, svc *services.Services, write bool) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	server := newMCPServer(&tools{svc: svc}, write)
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	_, err := server.Connect(ctx, serverTransport, nil)
	require.NoError(t, err)
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client"}, nil)
	session, err := client.Connect(ctx, clientTransport, nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = session.Close() })
	return session
}

func call(t *testing.T, cs *mcp.ClientSession, name string, args map[string]any) *mcp.CallToolResult {
	t.Helper()
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: args})
	require.NoError(t, err)
	return res
}

func text(res *mcp.CallToolResult) string {
	var b strings.Builder
	for _, c := range res.Content {
		if tc, ok := c.(*mcp.TextContent); ok {
			b.WriteString(tc.Text)
		}
	}
	return b.String()
}

// structured decodes a result's structured content into out.
func structured(t *testing.T, res *mcp.CallToolResult, out any) {
	t.Helper()
	require.False(t, res.IsError, text(res))
	raw, err := json.Marshal(res.StructuredContent)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(raw, out))
}

func requireToolError(t *testing.T, res *mcp.CallToolResult, contains string) {
	t.Helper()
	require.True(t, res.IsError, "expected a tool error, got: %s", text(res))
	assert.Contains(t, text(res), contains)
}

func seed(t *testing.T, svc *services.Services, path, title, content string, tags ...string) {
	t.Helper()
	require.NoError(t, svc.DocumentService.CreateDocument(&models.Document{
		MetaData: &models.DocumentMetaData{Title: title, Path: path, Tags: tags},
		Content:  content,
	}))
	require.NoError(t, svc.LinkService.UpdateBacklinks(path))
}

func toolNames(t *testing.T, cs *mcp.ClientSession) []string {
	t.Helper()
	res, err := cs.ListTools(context.Background(), nil)
	require.NoError(t, err)
	var names []string
	for _, tool := range res.Tools {
		names = append(names, tool.Name)
	}
	sort.Strings(names)
	return names
}

func TestTools_ReadOnlyServerHidesWriteTools(t *testing.T) {
	svc := newTestServices(t)

	assert.Equal(t, []string{"get_backlinks", "list_folder", "list_tags", "read_document", "search"},
		toolNames(t, connect(t, svc, false)))
	assert.Equal(t, []string{"append_to_document", "create_document", "get_backlinks", "list_folder",
		"list_tags", "read_document", "search", "update_document"}, toolNames(t, connect(t, svc, true)))
}

func TestTools_ReadToolsAreMarkedReadOnly(t *testing.T) {
	res, err := connect(t, newTestServices(t), true).ListTools(context.Background(), nil)
	require.NoError(t, err)
	for _, tool := range res.Tools {
		readOnly := tool.Annotations != nil && tool.Annotations.ReadOnlyHint
		write := strings.Contains(tool.Name, "document") && tool.Name != "read_document"
		assert.Equal(t, !write, readOnly, tool.Name)
	}
}

func TestTools_Search(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/guides/deploy", "Deployment checklist", "Run the migrations first.", "ops")
	cs := connect(t, svc, false)

	res := call(t, cs, "search", map[string]any{"query": "migrations"})
	var out searchOut
	structured(t, res, &out)
	require.Equal(t, 1, out.Total)
	assert.Equal(t, "/guides/deploy", out.Results[0].Path)
	assert.Equal(t, "Run the **migrations** first.", out.Results[0].Snippet)
	assert.Contains(t, text(res), "1. Deployment checklist (/guides/deploy)")

	structured(t, call(t, cs, "search", map[string]any{"query": "nothing-here"}), &out)
	assert.Equal(t, 0, out.Total)
	assert.Empty(t, out.Results)
}

func TestTools_ReadDocument(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/notes/plan", "Plan", "# Plan\n\nKeep {{secret:api_key}} out of it.", "work")
	cs := connect(t, svc, false)

	for _, p := range []string{"/notes/plan", "notes/plan", "/notes/plan.md"} {
		res := call(t, cs, "read_document", map[string]any{"path": p})
		var out documentOut
		structured(t, res, &out)
		assert.Equal(t, "/notes/plan", out.Path, p)
		assert.Equal(t, "Plan", out.Title)
		assert.Equal(t, []string{"work"}, out.Tags)
		assert.NotEmpty(t, out.Updated)
		assert.Contains(t, out.Content, "{{secret:api_key}}", "secret placeholders are returned as written")
		assert.True(t, strings.HasPrefix(text(res), "Title: Plan\nPath: /notes/plan\nTags: work\n"), text(res))
	}

	requireToolError(t, call(t, cs, "read_document", map[string]any{"path": "/missing"}), "not found")
	requireToolError(t, call(t, cs, "read_document", map[string]any{"path": "/../etc/passwd"}), "")
}

func TestTools_ListFolder(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/top", "Top", "x")
	seed(t, svc, "/guides/b", "Beta guide", "x")
	seed(t, svc, "/guides/a", "Alpha guide", "x")
	seed(t, svc, "/guides/deep/c", "Deep", "x")
	cs := connect(t, svc, false)

	var root folderOut
	structured(t, call(t, cs, "list_folder", map[string]any{}), &root)
	assert.Equal(t, "/", root.Path)
	assert.Equal(t, []pageEntry{{Title: "Top", Path: "/top", Updated: root.Documents[0].Updated}}, root.Documents)
	require.Len(t, root.Folders, 1)
	assert.Equal(t, "/guides", root.Folders[0].Path)

	var guides folderOut
	structured(t, call(t, cs, "list_folder", map[string]any{"path": "guides"}), &guides)
	assert.Equal(t, []string{"Alpha guide", "Beta guide"}, []string{guides.Documents[0].Title, guides.Documents[1].Title})
	require.Len(t, guides.Folders, 1)
	assert.Equal(t, "/guides/deep", guides.Folders[0].Path)

	requireToolError(t, call(t, cs, "list_folder", map[string]any{"path": "/nope"}), "not found")
}

func TestTools_BacklinksAndTags(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/target", "Target", "x", "shared", "only-here")
	seed(t, svc, "/source", "Source", "See [[Target]] for details.", "shared")
	cs := connect(t, svc, false)

	var links backlinksOut
	structured(t, call(t, cs, "get_backlinks", map[string]any{"path": "/target"}), &links)
	assert.Equal(t, []pageEntry{{Title: "Source", Path: "/source"}}, links.Backlinks)
	requireToolError(t, call(t, cs, "get_backlinks", map[string]any{"path": "/missing"}), "not found")

	var tags tagsOut
	structured(t, call(t, cs, "list_tags", nil), &tags)
	assert.Equal(t, []tagCount{{"shared", 2}, {"only-here", 1}}, tags.Tags)
}

func TestTools_CreateDocument(t *testing.T) {
	svc := newTestServices(t)
	cs := connect(t, svc, true)

	var out writeOut
	structured(t, call(t, cs, "create_document", map[string]any{
		"path": "notes/meeting-notes", "content": "Decided things.", "tags": []string{"meeting"},
	}), &out)
	assert.Equal(t, "/notes/meeting-notes", out.Path)
	assert.Equal(t, "Meeting notes", out.Title, "title made from the path")

	doc, err := svc.DocumentService.GetDocumentByPath("/notes/meeting-notes")
	require.NoError(t, err)
	assert.Equal(t, "Decided things.", doc.Content)
	assert.Equal(t, []string{"meeting"}, doc.MetaData.Tags)

	versions, err := svc.DocumentService.GetDocumentVersions("/notes/meeting-notes")
	require.NoError(t, err)
	assert.NotEmpty(t, versions, "creating commits to git")

	requireToolError(t, call(t, cs, "create_document", map[string]any{"path": "/notes/meeting-notes", "content": "again"}), "")
	requireToolError(t, call(t, cs, "create_document", map[string]any{"path": "/", "content": "x"}), "path is required")
}

func TestTools_UpdateDocument(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/doc", "Doc", "old", "a")
	cs := connect(t, svc, true)

	structured(t, call(t, cs, "update_document", map[string]any{"path": "/doc", "tags": []string{"b"}}), &writeOut{})
	doc, err := svc.DocumentService.GetDocumentByPath("/doc")
	require.NoError(t, err)
	assert.Equal(t, "old", doc.Content, "only the fields passed change")
	assert.Equal(t, []string{"b"}, doc.MetaData.Tags)

	structured(t, call(t, cs, "update_document", map[string]any{"path": "/doc", "content": "new", "title": "Renamed"}), &writeOut{})
	doc, err = svc.DocumentService.GetDocumentByPath("/doc")
	require.NoError(t, err)
	assert.Equal(t, "new", doc.Content)
	assert.Equal(t, "Renamed", doc.MetaData.Title)
	assert.Equal(t, "/doc", doc.MetaData.Path, "the path doesn't change")

	requireToolError(t, call(t, cs, "update_document", map[string]any{"path": "/doc"}), "at least one")
	requireToolError(t, call(t, cs, "update_document", map[string]any{"path": "/doc", "title": " "}), "can't be empty")
	requireToolError(t, call(t, cs, "update_document", map[string]any{"path": "/missing", "content": "x"}), "not found")
}

func TestTools_AppendToDocument(t *testing.T) {
	svc := newTestServices(t)
	seed(t, svc, "/log", "Log", "# Log\n\n## Monday\n\n- coffee\n\n## Tuesday\n\n- tea\n")
	cs := connect(t, svc, true)

	structured(t, call(t, cs, "append_to_document", map[string]any{"path": "/log", "heading": "monday", "content": "- more coffee"}), &writeOut{})
	structured(t, call(t, cs, "append_to_document", map[string]any{"path": "/log", "content": "## Wednesday\n\n- water"}), &writeOut{})

	doc, err := svc.DocumentService.GetDocumentByPath("/log")
	require.NoError(t, err)
	assert.Equal(t, "# Log\n\n## Monday\n\n- coffee\n\n- more coffee\n\n## Tuesday\n\n- tea\n\n## Wednesday\n\n- water\n", doc.Content)

	requireToolError(t, call(t, cs, "append_to_document", map[string]any{"path": "/log", "heading": "Friday", "content": "x"}), `no heading "Friday"`)
	requireToolError(t, call(t, cs, "append_to_document", map[string]any{"path": "/log", "content": "  "}), "content is required")
}

func TestAppendMarkdown(t *testing.T) {
	cases := []struct {
		name, content, heading, want string
	}{
		{"empty page", "", "", "added\n"},
		{"end of page", "text\n\n\n", "", "text\n\nadded\n"},
		{"last section", "# A\n\none\n", "A", "# A\n\none\n\nadded\n"},
		{"stops at same level", "## A\none\n## B\ntwo", "A", "## A\none\n\nadded\n\n## B\ntwo"},
		{"includes subsections", "## A\none\n### A.1\nsub\n## B", "## A", "## A\none\n### A.1\nsub\n\nadded\n\n## B"},
		{"ignores headings in code", "## A\n```\n## B\n```\n## C", "A", "## A\n```\n## B\n```\n\nadded\n\n## C"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := appendMarkdown(c.content, "added", c.heading)
			require.NoError(t, err)
			assert.Equal(t, c.want, got)
		})
	}

	_, err := appendMarkdown("## A", "x", "B")
	assert.Error(t, err)
}

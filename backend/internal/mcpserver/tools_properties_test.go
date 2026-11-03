package mcpserver

import (
	"testing"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedWithProperties(t *testing.T, svc *services.Services, path string, props map[string]any) {
	t.Helper()
	require.NoError(t, svc.DocumentService.CreateDocument(&models.Document{
		MetaData: &models.DocumentMetaData{Title: "Docki", Path: path, Properties: props},
		Content:  "Runs things.",
	}))
}

func properties(t *testing.T, svc *services.Services, path string) map[string]any {
	t.Helper()
	doc, err := svc.DocumentService.GetDocumentByPath(path)
	require.NoError(t, err)
	return doc.MetaData.Properties
}

func TestTools_ReadDocument_Properties(t *testing.T) {
	svc := newTestServices(t)
	seedWithProperties(t, svc, "/docki", map[string]any{
		"status": "active", "aliases": []any{"docker host", "dh"}, "owner": map[string]any{"name": "ops"},
	})
	seed(t, svc, "/plain", "Plain", "x")
	cs := connect(t, svc, false)

	res := call(t, cs, "read_document", map[string]any{"path": "/docki"})
	var out documentOut
	structured(t, res, &out)
	assert.Equal(t, map[string]any{
		"status": "active", "aliases": []any{"docker host", "dh"}, "owner": map[string]any{"name": "ops"},
	}, out.Properties)
	assert.Contains(t, text(res), "Properties:\n  aliases: [\"docker host\",\"dh\"]\n  owner: {\"name\":\"ops\"}\n  status: \"active\"\n",
		"properties are listed sorted, values as JSON")

	res = call(t, cs, "read_document", map[string]any{"path": "/plain"})
	var plain documentOut
	structured(t, res, &plain)
	assert.Empty(t, plain.Properties)
	assert.NotContains(t, text(res), "Properties:")
}

func TestTools_CreateDocument_Properties(t *testing.T) {
	svc := newTestServices(t)
	cs := connect(t, svc, true)

	structured(t, call(t, cs, "create_document", map[string]any{
		"path": "/hosts/docki", "content": "x", "properties": map[string]any{"status": "active", "aliases": []string{"dh"}},
	}), &writeOut{})
	assert.Equal(t, map[string]any{"status": "active", "aliases": []any{"dh"}}, properties(t, svc, "/hosts/docki"))

	requireToolError(t, call(t, cs, "create_document", map[string]any{
		"path": "/hosts/other", "content": "x", "properties": map[string]any{"Title": "sneaky"},
	}), `"Title" is not a property`)
	_, err := svc.DocumentService.GetDocumentByPath("/hosts/other")
	assert.Error(t, err, "nothing is created when a property is refused")
}

func TestTools_UpdateDocument_Properties(t *testing.T) {
	svc := newTestServices(t)
	seedWithProperties(t, svc, "/docki", map[string]any{"status": "active", "aliases": []any{"dh"}})
	cs := connect(t, svc, true)

	// Omitted: kept.
	structured(t, call(t, cs, "update_document", map[string]any{"path": "/docki", "content": "new"}), &writeOut{})
	assert.Equal(t, map[string]any{"status": "active", "aliases": []any{"dh"}}, properties(t, svc, "/docki"))

	// An object: replaces them all.
	structured(t, call(t, cs, "update_document", map[string]any{"path": "/docki", "properties": map[string]any{"status": "retired"}}), &writeOut{})
	assert.Equal(t, map[string]any{"status": "retired"}, properties(t, svc, "/docki"))
	doc, err := svc.DocumentService.GetDocumentByPath("/docki")
	require.NoError(t, err)
	assert.Equal(t, "new", doc.Content, "only the fields passed change")

	// Other write tools keep them.
	structured(t, call(t, cs, "edit_document", map[string]any{"path": "/docki", "old_text": "new", "new_text": "newer"}), &editOut{})
	assert.Equal(t, map[string]any{"status": "retired"}, properties(t, svc, "/docki"))

	// An empty object: clears them.
	structured(t, call(t, cs, "update_document", map[string]any{"path": "/docki", "properties": map[string]any{}}), &writeOut{})
	assert.Empty(t, properties(t, svc, "/docki"))

	requireToolError(t, call(t, cs, "update_document", map[string]any{"path": "/docki", "properties": map[string]any{"tags": []string{"x"}}}),
		`"tags" is not a property`)
}

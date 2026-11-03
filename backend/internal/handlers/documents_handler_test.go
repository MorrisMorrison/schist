package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/models"
)

func TestDocumentHandlers_MissingMetaDataIsBadRequest(t *testing.T) {
	tests := []struct {
		name   string
		method string
		target string
		body   string
	}{
		{name: "create without metaData", method: http.MethodPost, target: "/api/documents", body: `{"content":"x"}`},
		{name: "update without document", method: http.MethodPut, target: "/api/documents/a", body: `{"saveType":"auto"}`},
		{name: "update without metaData", method: http.MethodPut, target: "/api/documents/a", body: `{"content":"x"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			env := newAPIEnv(t, apiEnvOptions{})
			w := env.request(t, tt.method, tt.target, tt.body)
			assert.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
		})
	}
}

// Regression for the reported bug: PUT with metaData lacking `created` reset
// the created date to the zero time.
func TestDocumentHandlers_UpdateKeepsCreated(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	meta := map[string]any{"title": "A", "path": "/projects/a", "tags": []string{"x"}}

	w := env.request(t, http.MethodPost, "/api/documents", map[string]any{"metaData": meta, "content": "v1"})
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	w = env.request(t, http.MethodGet, "/api/documents/projects/a", nil)
	require.Equal(t, http.StatusOK, w.Code)
	var before models.Document
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &before))

	w = env.request(t, http.MethodPut, "/api/documents/projects/a", map[string]any{"metaData": meta, "content": "v2"})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	w = env.request(t, http.MethodGet, "/api/documents/projects/a", nil)
	require.Equal(t, http.StatusOK, w.Code)
	var after models.Document
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &after))

	assert.False(t, after.MetaData.Created.IsZero())
	assert.True(t, after.MetaData.Created.Equal(before.MetaData.Created))
	assert.True(t, after.MetaData.Created.Before(time.Now().Add(time.Second)))
	assert.Equal(t, "v2", after.Content)
}

func TestDocumentHandlers_TrashingSamePathTwice(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})

	for _, content := range []string{"first", "second"} {
		w := env.request(t, http.MethodPost, "/api/documents", map[string]any{
			"metaData": map[string]any{"title": "A", "path": "/a"},
			"content":  content,
		})
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

		w = env.request(t, http.MethodDelete, "/api/documents/a", nil)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	}

	w := env.request(t, http.MethodGet, "/api/documents/trash/a", nil)
	require.Equal(t, http.StatusOK, w.Code)
	var trashed models.Document
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &trashed))
	assert.Equal(t, "second", trashed.Content, "the most recently deleted copy is kept in trash")
}

func TestDocumentHandlers_MoveOntoExistingIsConflict(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	for _, p := range []string{"/a", "/b"} {
		w := env.request(t, http.MethodPost, "/api/documents", map[string]any{
			"metaData": map[string]any{"title": p, "path": p},
			"content":  "content " + p,
		})
		require.Equal(t, http.StatusCreated, w.Code)
	}

	// Renaming /a to /b through the update endpoint must not destroy /b.
	w := env.request(t, http.MethodPut, "/api/documents/a", map[string]any{
		"metaData": map[string]any{"title": "a", "path": "/b"},
		"content":  "content /a",
	})
	assert.Equal(t, http.StatusConflict, w.Code, w.Body.String())

	w = env.request(t, http.MethodGet, "/api/documents/b", nil)
	require.Equal(t, http.StatusOK, w.Code)
	var b models.Document
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &b))
	assert.Equal(t, "content /b", b.Content)
}

// The list carries metadata and a short excerpt, never whole pages: the
// frontend loads it at start, and with a large wiki full content made that
// one response the size of the wiki.
func TestDocumentHandlers_ListReturnsMetadataAndExcerpt(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	long := strings.Repeat("é long text ", 100) // multi-byte, well over the excerpt
	for _, doc := range []map[string]any{
		{"metaData": map[string]any{"title": "Short", "path": "/short", "tags": []string{"x"}}, "content": "Just this."},
		{"metaData": map[string]any{"title": "Long", "path": "/notes/long"}, "content": long},
	} {
		w := env.request(t, http.MethodPost, "/api/documents", doc)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	}

	w := env.request(t, http.MethodGet, "/api/documents", nil)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var raw struct {
		Documents []map[string]json.RawMessage `json:"documents"`
		Total     int                          `json:"total"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &raw))
	require.Equal(t, 2, raw.Total)

	byPath := map[string]map[string]json.RawMessage{}
	for _, doc := range raw.Documents {
		_, hasContent := doc["content"]
		assert.False(t, hasContent, "list must not carry content")
		var meta models.DocumentMetaData
		require.NoError(t, json.Unmarshal(doc["metaData"], &meta))
		assert.False(t, meta.Created.IsZero())
		byPath[meta.Path] = doc
	}

	var excerpt string
	require.NoError(t, json.Unmarshal(byPath["/short"]["excerpt"], &excerpt))
	assert.Equal(t, "Just this.", excerpt)

	require.NoError(t, json.Unmarshal(byPath["/notes/long"]["excerpt"], &excerpt))
	assert.True(t, utf8.ValidString(excerpt))
	assert.Equal(t, documentExcerptLength, utf8.RuneCountInString(excerpt))
	assert.True(t, strings.HasPrefix(long, excerpt))
}

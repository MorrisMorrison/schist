package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

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

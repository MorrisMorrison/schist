package handlers

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHealthAndConfig(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})

	w := env.do(t, http.MethodGet, "/api/health", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "ok", decode(t, w)["status"])

	w = env.do(t, http.MethodGet, "/api/config", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, false, decode(t, w)["auth_enabled"])

	w = env.do(t, http.MethodGet, "/api/git/health", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, true, decode(t, w)["healthy"])

	w = env.do(t, http.MethodPost, "/api/git/repair", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, true, decode(t, w)["success"])
}

func TestGitHealth_NoGitService(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	h := NewAPIHandler(env.svc)
	h.GitService = nil
	router := newBareRouter()
	router.GET("/health", h.gitHealthCheck)
	router.POST("/repair", h.repairGitRepository)

	w := serve(router, newRequest(http.MethodGet, "/health", ""))
	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Equal(t, false, decode(t, w)["healthy"])
	w = serve(router, newRequest(http.MethodPost, "/repair", ""))
	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Equal(t, false, decode(t, w)["success"])
}

func TestDocuments_CRUDOverHTTP(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	env.createDoc(t, "/notes/alpha", "Alpha", "hello [[beta]]", "go")

	md := filepath.Join(env.dataDir, "notes", "alpha.md")
	raw, err := os.ReadFile(md)
	require.NoError(t, err)
	assert.Contains(t, string(raw), "title: Alpha")
	assert.Contains(t, string(raw), "hello [[beta]]")

	w := env.do(t, http.MethodGet, "/api/documents", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.EqualValues(t, 1, decode(t, w)["total"])

	w = env.do(t, http.MethodHead, "/api/documents/notes/alpha", nil, "")
	assert.Equal(t, http.StatusOK, w.Code)
	w = env.do(t, http.MethodHead, "/api/documents/notes/missing", nil, "")
	assert.Equal(t, http.StatusNotFound, w.Code)

	w = env.do(t, http.MethodGet, "/api/documents/notes/missing", nil, "")
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")

	w = env.do(t, http.MethodPost, "/api/documents", `{`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")

	w = env.do(t, http.MethodPut, "/api/documents/notes/alpha", `{`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")

	// PUT is an upsert: saving a path that doesn't exist yet writes it.
	w = env.do(t, http.MethodPut, "/api/documents/notes/fresh", map[string]any{
		"metaData": map[string]any{"title": "x", "path": "/notes/fresh"}, "content": "x",
	}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.FileExists(t, filepath.Join(env.dataDir, "notes", "fresh.md"))

	// Renaming onto a path outside the data dir is rejected.
	w = env.do(t, http.MethodPut, "/api/documents/notes/fresh", map[string]any{
		"metaData": map[string]any{"title": "x", "path": "/../outside"}, "content": "x",
	}, "")
	assert.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())

	// Rename through PUT moves the file on disk.
	w = env.do(t, http.MethodPut, "/api/documents/notes/alpha", map[string]any{
		"metaData": map[string]any{"title": "Alpha", "path": "/notes/alpha2"}, "content": "renamed", "saveType": "auto",
	}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.NoFileExists(t, md)
	assert.FileExists(t, filepath.Join(env.dataDir, "notes", "alpha2.md"))

	// Move endpoint.
	w = env.do(t, http.MethodPost, "/api/documents/move", `{"oldPath":"notes/alpha2","newPath":"archive/alpha"}`, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, "/archive/alpha", decode(t, w)["newPath"])
	assert.FileExists(t, filepath.Join(env.dataDir, "archive", "alpha.md"))

	w = env.do(t, http.MethodPost, "/api/documents/move", `{"oldPath":"/archive/alpha"}`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")
	w = env.do(t, http.MethodPost, "/api/documents/move", `{"oldPath":"/nope","newPath":"/nope2"}`, "")
	assert.Equal(t, http.StatusNotFound, w.Code, w.Body.String())

	// Delete moves to trash, deleting from trash removes permanently.
	w = env.do(t, http.MethodDelete, "/api/documents/archive/alpha", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.FileExists(t, filepath.Join(env.dataDir, "trash", "archive", "alpha.md"))

	w = env.do(t, http.MethodDelete, "/api/documents/trash/archive/alpha", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, "Document permanently deleted", decode(t, w)["message"])
	assert.NoFileExists(t, filepath.Join(env.dataDir, "trash", "archive", "alpha.md"))

	w = env.do(t, http.MethodDelete, "/api/documents/trash/archive/alpha", nil, "")
	assert.Equal(t, http.StatusNotFound, w.Code, w.Body.String())
	w = env.do(t, http.MethodDelete, "/api/documents/never-existed", nil, "")
	assert.Equal(t, http.StatusNotFound, w.Code, w.Body.String())
}

func TestDocuments_PathTraversalRejected(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	w := env.do(t, http.MethodPost, "/api/documents", map[string]any{
		"metaData": map[string]any{"title": "x", "path": "/../escape"}, "content": "x",
	}, "")
	assert.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
	assert.NoFileExists(t, filepath.Join(filepath.Dir(env.dataDir), "escape.md"))
}

func TestFolders_OverHTTP(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})

	w := env.do(t, http.MethodPost, "/api/folders", `{"path":"projects"}`, "")
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.Equal(t, "/projects", decode(t, w)["path"])
	assert.DirExists(t, filepath.Join(env.dataDir, "projects"))

	w = env.do(t, http.MethodPost, "/api/folders", `{}`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")
	// Creating an existing folder is idempotent.
	w = env.do(t, http.MethodPost, "/api/folders", `{"path":"projects"}`, "")
	assert.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	w = env.do(t, http.MethodPost, "/api/folders", `{"path":"../outside"}`, "")
	assert.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())

	env.createDoc(t, "/projects/doc", "Doc", "content")

	w = env.do(t, http.MethodGet, "/api/folders", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Contains(t, w.Body.String(), "projects")

	w = env.do(t, http.MethodGet, "/api/folders/projects", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, "/projects", decode(t, w)["path"])

	w = env.do(t, http.MethodGet, "/api/folders/missing", nil, "")
	assert.Equal(t, http.StatusNotFound, w.Code, w.Body.String())

	w = env.do(t, http.MethodPut, "/api/folders/projects", `{}`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")
	w = env.do(t, http.MethodPut, "/api/folders/projects", `{"newName":"work"}`, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.FileExists(t, filepath.Join(env.dataDir, "work", "doc.md"))
	w = env.do(t, http.MethodPut, "/api/folders/missing", `{"newName":"x"}`, "")
	assert.GreaterOrEqual(t, w.Code, 400, w.Body.String())

	w = env.do(t, http.MethodPost, "/api/folders", `{"path":"archive"}`, "")
	require.Equal(t, http.StatusCreated, w.Code)
	w = env.do(t, http.MethodPost, "/api/folders/move", `{"oldPath":"work","newPath":"archive/work"}`, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.FileExists(t, filepath.Join(env.dataDir, "archive", "work", "doc.md"))
	w = env.do(t, http.MethodPost, "/api/folders/move", `{"oldPath":"work"}`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")
	w = env.do(t, http.MethodPost, "/api/folders/move", `{"oldPath":"nope","newPath":"nope2"}`, "")
	assert.GreaterOrEqual(t, w.Code, 400, w.Body.String())

	w = env.do(t, http.MethodDelete, "/api/folders/archive", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.NoDirExists(t, filepath.Join(env.dataDir, "archive"))
	w = env.do(t, http.MethodDelete, "/api/folders/archive", nil, "")
	assert.GreaterOrEqual(t, w.Code, 400, w.Body.String())
}

func TestVersions_OverHTTP(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	env.createDoc(t, "/v", "V", "first")
	w := env.do(t, http.MethodPut, "/api/documents/v", map[string]any{
		"metaData": map[string]any{"title": "V", "path": "/v"}, "content": "second",
	}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	w = env.do(t, http.MethodGet, "/api/versions?path=v", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	body := decode(t, w)
	assert.Equal(t, "/v", body["path"])
	versions := body["versions"].([]any)
	require.GreaterOrEqual(t, len(versions), 2)
	hashOf := func(v any) string {
		m := v.(map[string]any)
		for _, k := range []string{"hash", "commitHash", "commit_hash"} {
			if s, ok := m[k].(string); ok {
				return s
			}
		}
		t.Fatalf("no hash in %v", m)
		return ""
	}
	newest, oldest := hashOf(versions[0]), hashOf(versions[len(versions)-1])

	w = env.do(t, http.MethodGet, "/api/versions/document?path=/v&hash="+oldest, nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Contains(t, w.Body.String(), "first")

	w = env.do(t, http.MethodGet, "/api/versions/diff?path=/v&hash1="+oldest+"&hash2="+newest, nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Contains(t, w.Body.String(), "diff")

	w = env.do(t, http.MethodPost, "/api/versions/restore?path=/v&hash="+oldest, nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	raw, err := os.ReadFile(filepath.Join(env.dataDir, "v.md"))
	require.NoError(t, err)
	assert.Contains(t, string(raw), "first")
	assert.NotContains(t, string(raw), "second")

	missing := []struct{ method, target, field string }{
		{http.MethodGet, "/api/versions", "path"},
		{http.MethodGet, "/api/versions/document", "path"},
		{http.MethodGet, "/api/versions/document?path=/v", "hash"},
		{http.MethodGet, "/api/versions/diff", "path"},
		{http.MethodGet, "/api/versions/diff?path=/v", "hash1"},
		{http.MethodGet, "/api/versions/diff?path=/v&hash1=a", "hash2"},
		{http.MethodPost, "/api/versions/restore", "path"},
		{http.MethodPost, "/api/versions/restore?path=/v", "hash"},
	}
	for _, m := range missing {
		t.Run("missing "+m.field+" "+m.target, func(t *testing.T) {
			w := env.do(t, m.method, m.target, nil, "")
			resp := requireAPIError(t, w, http.StatusBadRequest, "MISSING_REQUIRED_FIELD")
			assert.Contains(t, resp.Details["field"], m.field)
		})
	}

	bad := "0000000000000000000000000000000000000000"
	for _, target := range []string{
		"/api/versions/document?path=/v&hash=" + bad,
		"/api/versions/diff?path=/v&hash1=" + bad + "&hash2=" + newest,
	} {
		w := env.do(t, http.MethodGet, target, nil, "")
		assert.GreaterOrEqual(t, w.Code, 400, target)
	}
	w = env.do(t, http.MethodPost, "/api/versions/restore?path=/v&hash="+bad, nil, "")
	assert.GreaterOrEqual(t, w.Code, 400)
	w = env.do(t, http.MethodGet, "/api/versions?path=/../x", nil, "")
	assert.GreaterOrEqual(t, w.Code, 400)
}

func TestSearchTagsTemplates(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	env.createDoc(t, "/a", "Apple pie", "baking recipe", "food", "dessert")
	env.createDoc(t, "/b", "Banana", "fruit", "food")

	// Search matches titles and bodies, with tag: filters.
	w := env.do(t, http.MethodGet, "/api/search?q=apple", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	body := decode(t, w)
	assert.Equal(t, "apple", body["query"])
	assert.EqualValues(t, 1, body["total"])
	result := body["results"].([]any)[0].(map[string]any)
	assert.Equal(t, "/a", result["path"])
	assert.Equal(t, "Apple pie", result["title"])
	assert.Equal(t, "title", result["matchedIn"])

	w = env.do(t, http.MethodGet, "/api/search?q=recipe", nil, "")
	body = decode(t, w)
	require.EqualValues(t, 1, body["total"])
	result = body["results"].([]any)[0].(map[string]any)
	assert.Equal(t, "content", result["matchedIn"])
	assert.Equal(t, []any{
		map[string]any{"text": "baking "},
		map[string]any{"text": "recipe", "match": true},
	}, result["snippet"])

	w = env.do(t, http.MethodGet, "/api/search?q=tag:food&limit=1", nil, "")
	body = decode(t, w)
	assert.EqualValues(t, 2, body["total"], "total counts every match")
	assert.Len(t, body["results"], 1)
	w = env.do(t, http.MethodGet, "/api/search?q=", nil, "")
	assert.Equal(t, []any{}, decode(t, w)["results"], "empty query: empty list, not null")
	w = env.do(t, http.MethodGet, "/api/search?q=tag:food", nil, "")
	assert.EqualValues(t, 2, decode(t, w)["total"])
	w = env.do(t, http.MethodGet, "/api/search?q=tag:food+tag:dessert", nil, "")
	assert.EqualValues(t, 1, decode(t, w)["total"])

	w = env.do(t, http.MethodGet, "/api/tags", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	tags := map[string]float64{}
	for _, tag := range decode(t, w)["tags"].([]any) {
		m := tag.(map[string]any)
		tags[m["name"].(string)] = m["count"].(float64)
	}
	assert.Equal(t, map[string]float64{"food": 2, "dessert": 1}, tags)

	w = env.do(t, http.MethodGet, "/api/templates", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Greater(t, decode(t, w)["total"], float64(0))
}

func TestTemplates_UnreadableDir(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	// A regular file where the templates directory should be.
	file := filepath.Join(env.dataDir, "not-a-dir")
	require.NoError(t, os.WriteFile(file, []byte("x"), 0o600))
	env.svc.Config.TemplatesDir = file
	env.svc.TemplateService = newTemplateServiceFor(env)

	w := env.do(t, http.MethodGet, "/api/templates", nil, "")
	resp := requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
	assert.Equal(t, "Internal server error", resp.Error, "the cause (with its file path) is logged, not returned")
}

// When the data dir cannot be listed, the listing endpoints report a plain
// internal error: the cause names server file paths and is only logged.
func TestListings_InternalFailureHidesCause(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	env.createDoc(t, "/a", "A", "content")
	require.NoError(t, os.RemoveAll(env.dataDir))

	for _, target := range []string{"/api/search?q=a", "/api/tags", "/api/links/broken"} {
		w := env.do(t, http.MethodGet, target, nil, "")
		resp := requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
		assert.Equal(t, "Internal server error", resp.Error, target)
	}
}

func TestLinks_OverHTTP(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	env.createDoc(t, "/target", "Target", "I am linked")
	env.createDoc(t, "/source", "Source", "see [[target]] and [[nowhere]]")

	w := env.do(t, http.MethodGet, "/api/links/outgoing/source", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, "/source", decode(t, w)["path"])
	assert.GreaterOrEqual(t, decode(t, w)["total"], float64(1))

	w = env.do(t, http.MethodGet, "/api/links/backlinks/target", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Contains(t, w.Body.String(), "/source")

	w = env.do(t, http.MethodGet, "/api/links/broken", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Contains(t, w.Body.String(), "nowhere")

	w = env.do(t, http.MethodGet, "/api/links/outgoing/missing", nil, "")
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")
}

func multipartFiles(t *testing.T, fields map[string]string, files map[string]string) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for k, v := range fields {
		require.NoError(t, mw.WriteField(k, v))
	}
	for name, content := range files {
		part, err := mw.CreateFormFile("files", name)
		require.NoError(t, err)
		_, err = part.Write([]byte(content))
		require.NoError(t, err)
	}
	require.NoError(t, mw.Close())
	return &buf, mw.FormDataContentType()
}

func TestImportDocuments_OverHTTP(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})

	body, ct := multipartFiles(t, map[string]string{"target_path": "/imported"}, map[string]string{
		"hello.md": "# Hello\n\nworld",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/import/documents", body)
	req.Header.Set("Content-Type", ct)
	w := serve(env.router, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.EqualValues(t, 1, decode(t, w)["imported_count"])

	entries, err := os.ReadDir(filepath.Join(env.dataDir, "imported"))
	require.NoError(t, err)
	require.Len(t, entries, 1)

	// No files at all.
	body, ct = multipartFiles(t, map[string]string{"target_path": "/x"}, nil)
	req = httptest.NewRequest(http.MethodPost, "/api/import/documents", body)
	req.Header.Set("Content-Type", ct)
	requireAPIError(t, serve(env.router, req), http.StatusBadRequest, "VALIDATION_ERROR")

	// Not multipart.
	w = env.do(t, http.MethodPost, "/api/import/documents", `{}`, "")
	requireAPIError(t, w, http.StatusBadRequest, "VALIDATION_ERROR")
}

func TestExport_OverHTTP(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	env.createDoc(t, "/exp/one", "One", "exported body")

	w := env.do(t, http.MethodGet, "/api/export/document/exp/one", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Contains(t, w.Header().Get("Content-Disposition"), "attachment")
	assert.Contains(t, w.Body.String(), "exported body")

	w = env.do(t, http.MethodGet, "/api/export/document/exp/missing", nil, "")
	assert.Equal(t, http.StatusNotFound, w.Code)

	w = env.do(t, http.MethodGet, "/api/export/all", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/zip", w.Header().Get("Content-Type"))
	assert.True(t, strings.HasPrefix(w.Body.String(), "PK"), "zip magic")

	w = env.do(t, http.MethodGet, "/api/export/folder/exp", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.True(t, strings.HasPrefix(w.Body.String(), "PK"))
}

package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Custom front matter (properties) is returned by the document API and
// survives saves that don't send it.
func TestDocuments_PropertiesOverHTTP(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	md := filepath.Join(env.dataDir, "devices", "router.md")
	require.NoError(t, os.MkdirAll(filepath.Dir(md), 0o755))
	require.NoError(t, os.WriteFile(md, []byte("---\ntitle: Router\npath: /devices/router\nstatus: active\naliases: [gateway]\nnested:\n  vlan: 10\n---\n\nBody."), 0o644))

	properties := func() any {
		w := env.do(t, http.MethodGet, "/api/documents/devices/router", nil, "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		return decode(t, w)["metaData"].(map[string]any)["properties"]
	}
	assert.Equal(t, map[string]any{
		"status": "active", "aliases": []any{"gateway"}, "nested": map[string]any{"vlan": float64(10)},
	}, properties())

	// A save without properties (an older client, a partial update) keeps them.
	w := env.do(t, http.MethodPut, "/api/documents/devices/router", map[string]any{
		"metaData": map[string]any{"title": "Router", "path": "/devices/router"}, "content": "Edited.",
	}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, "active", decode(t, w)["metaData"].(map[string]any)["properties"].(map[string]any)["status"])
	assert.Equal(t, "active", properties().(map[string]any)["status"])

	// Renaming through PUT keeps them too.
	w = env.do(t, http.MethodPut, "/api/documents/devices/router", map[string]any{
		"metaData": map[string]any{"title": "Router", "path": "/devices/gateway"}, "content": "Moved.",
	}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	raw, err := os.ReadFile(filepath.Join(env.dataDir, "devices", "gateway.md"))
	require.NoError(t, err)
	assert.Contains(t, string(raw), "status: active")

	// Sent properties replace the stored ones; an empty object clears them.
	w = env.do(t, http.MethodPut, "/api/documents/devices/gateway", map[string]any{
		"metaData": map[string]any{"title": "Router", "path": "/devices/gateway", "properties": map[string]any{"status": "retired", "owner": "ops"}},
		"content":  "Retired.",
	}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	got := env.do(t, http.MethodGet, "/api/documents/devices/gateway", nil, "")
	assert.Equal(t, map[string]any{"status": "retired", "owner": "ops"}, decode(t, got)["metaData"].(map[string]any)["properties"])

	w = env.do(t, http.MethodPut, "/api/documents/devices/gateway", map[string]any{
		"metaData": map[string]any{"title": "Router", "path": "/devices/gateway", "properties": map[string]any{}},
		"content":  "Plain.",
	}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	got = env.do(t, http.MethodGet, "/api/documents/devices/gateway", nil, "")
	assert.NotContains(t, decode(t, got)["metaData"], "properties")
}

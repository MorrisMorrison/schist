package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// unlockedEnv returns an env with an admin signed in and the secret store
// unlocked through the real passkey ticket flow.
func unlockedEnv(t *testing.T) *apiEnv {
	t.Helper()
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	a, _ := env.setupAdmin(t, "alice")
	w := env.do(t, http.MethodPost, "/api/passkeys/unlock", map[string]any{"authTicket": env.authTicket(t, a)}, env.token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	return env
}

func TestSecrets_LockedStoreRejectsAccess(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	w := env.do(t, http.MethodGet, "/api/secrets/status", nil, env.token)
	require.Equal(t, http.StatusOK, w.Code)
	status := decode(t, w)
	assert.Equal(t, false, status["unlocked"])
	assert.Equal(t, true, status["has_passkeys"])
	assert.Equal(t, false, status["has_secrets"])
	assert.Equal(t, false, status["requires_setup"])

	routes := []struct{ method, target, body string }{
		{http.MethodGet, "/api/secrets", ""},
		{http.MethodPost, "/api/secrets", `{"key":"k","value":"v"}`},
		{http.MethodGet, "/api/secrets/k", ""},
		{http.MethodPut, "/api/secrets/k", `{"value":"v"}`},
		{http.MethodDelete, "/api/secrets/k", ""},
	}
	for _, r := range routes {
		t.Run(r.method+" "+r.target, func(t *testing.T) {
			w := env.do(t, r.method, r.target, r.body, env.token)
			requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")
		})
	}

	// And an anonymous caller is stopped by the JWT middleware first.
	w = env.do(t, http.MethodGet, "/api/secrets/status", nil, "")
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestSecrets_CRUD(t *testing.T) {
	env := unlockedEnv(t)

	w := env.do(t, http.MethodGet, "/api/secrets", nil, env.token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Empty(t, decode(t, w)["secrets"])

	w = env.do(t, http.MethodPost, "/api/secrets", `{"key":"api-key","value":"s3cr3t-value"}`, env.token)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	// Stored encrypted, never in plaintext.
	raw, err := os.ReadFile(filepath.Join(env.dataDir, ".schist", "config.json"))
	require.NoError(t, err)
	assert.Contains(t, string(raw), "api-key")
	assert.NotContains(t, string(raw), "s3cr3t-value")

	w = env.do(t, http.MethodGet, "/api/secrets/api-key", nil, env.token)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "s3cr3t-value", decode(t, w)["value"])

	w = env.do(t, http.MethodPut, "/api/secrets/api-key", `{"value":"rotated"}`, env.token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	w = env.do(t, http.MethodGet, "/api/secrets/api-key", nil, env.token)
	assert.Equal(t, "rotated", decode(t, w)["value"])

	w = env.do(t, http.MethodGet, "/api/secrets", nil, env.token)
	assert.Equal(t, []any{"api-key"}, decode(t, w)["secrets"])

	w = env.do(t, http.MethodGet, "/api/secrets/status", nil, env.token)
	status := decode(t, w)
	assert.Equal(t, true, status["unlocked"])
	assert.Equal(t, true, status["has_secrets"])

	w = env.do(t, http.MethodDelete, "/api/secrets/api-key", nil, env.token)
	require.Equal(t, http.StatusOK, w.Code)
	w = env.do(t, http.MethodGet, "/api/secrets/api-key", nil, env.token)
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")
	w = env.do(t, http.MethodDelete, "/api/secrets/api-key", nil, env.token)
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")

	w = env.do(t, http.MethodPost, "/api/secrets/lock", nil, env.token)
	require.Equal(t, http.StatusOK, w.Code)
	w = env.do(t, http.MethodGet, "/api/secrets", nil, env.token)
	requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")
}

func TestSecrets_Validation(t *testing.T) {
	env := unlockedEnv(t)

	tests := []struct {
		name, method, target, body string
		status                     int
		code                       string
	}{
		{"create malformed", http.MethodPost, "/api/secrets", `{`, http.StatusBadRequest, "INVALID_REQUEST"},
		{"create without key", http.MethodPost, "/api/secrets", `{"value":"v"}`, http.StatusBadRequest, "INVALID_REQUEST"},
		{"create without value", http.MethodPost, "/api/secrets", `{"key":"k"}`, http.StatusBadRequest, "INVALID_REQUEST"},
		{"update malformed", http.MethodPut, "/api/secrets/k", `{`, http.StatusBadRequest, "INVALID_REQUEST"},
		{"update without value", http.MethodPut, "/api/secrets/k", `{}`, http.StatusBadRequest, "INVALID_REQUEST"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := env.do(t, tt.method, tt.target, tt.body, env.token)
			requireAPIError(t, w, tt.status, tt.code)
		})
	}
}

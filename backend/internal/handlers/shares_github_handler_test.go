package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/crypto"
)

func TestShares_Lifecycle(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{sharingEnabled: true})
	env.createDoc(t, "/shared/doc", "Shared", "public body")

	w := env.do(t, http.MethodPost, "/api/shares", `{"document_path":"/shared/doc","expiry_days":3}`, "")
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var share ShareResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &share))
	assert.Equal(t, "anonymous", share.CreatedBy)
	assert.Equal(t, "http://localhost:5173/share/"+share.Token, share.ShareURL)
	expires, err := time.Parse("2006-01-02T15:04:05Z", share.ExpiresAt)
	require.NoError(t, err)
	assert.WithinDuration(t, time.Now().AddDate(0, 0, 3), expires, 24*time.Hour)

	w = env.do(t, http.MethodGet, "/api/shares/"+share.Token, nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, "public body", decode(t, w)["content"])

	w = env.do(t, http.MethodGet, "/api/shares", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.EqualValues(t, 1, decode(t, w)["total"])

	w = env.do(t, http.MethodPost, "/api/shares/cleanup", nil, "")
	require.Equal(t, http.StatusOK, w.Code)

	w = env.do(t, http.MethodDelete, "/api/shares/"+share.ID, nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	w = env.do(t, http.MethodDelete, "/api/shares/"+share.ID, nil, "")
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")

	w = env.do(t, http.MethodGet, "/api/shares/"+share.Token, nil, "")
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")
}

func TestShares_Validation(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{sharingEnabled: true})

	w := env.do(t, http.MethodPost, "/api/shares", `{`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")
	w = env.do(t, http.MethodPost, "/api/shares", `{}`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")
	w = env.do(t, http.MethodPost, "/api/shares", `{"document_path":"/missing"}`, "")
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")
	w = env.do(t, http.MethodGet, "/api/shares/not-a-token", nil, "")
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")
}

func TestShares_ExpiredShareIsGoneAndCleanedUp(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{sharingEnabled: true})
	env.createDoc(t, "/d", "D", "x")
	w := env.do(t, http.MethodPost, "/api/shares", `{"document_path":"/d"}`, "")
	require.Equal(t, http.StatusCreated, w.Code)
	token := decode(t, w)["token"].(string)

	// Age the share past its expiry on disk.
	sharesFile := filepath.Join(env.dataDir, ".schist", "shares.json")
	raw, err := os.ReadFile(sharesFile)
	require.NoError(t, err)
	var shares []map[string]any
	require.NoError(t, json.Unmarshal(raw, &shares))
	require.Len(t, shares, 1)
	shares[0]["expires_at"] = time.Now().Add(-time.Hour).Format(time.RFC3339)
	raw, err = json.Marshal(shares)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(sharesFile, raw, 0o600))

	w = env.do(t, http.MethodGet, "/api/shares/"+token, nil, "")
	assert.GreaterOrEqual(t, w.Code, 400, w.Body.String())
	w = env.do(t, http.MethodGet, "/api/shares", nil, "")
	assert.EqualValues(t, 0, decode(t, w)["total"])

	w = env.do(t, http.MethodPost, "/api/shares/cleanup", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	raw, err = os.ReadFile(sharesFile)
	require.NoError(t, err)
	assert.NotContains(t, string(raw), token)
}

func TestShares_Disabled(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{sharingEnabled: false})
	env.createDoc(t, "/d", "D", "x")

	w := env.do(t, http.MethodPost, "/api/shares", `{"document_path":"/d"}`, "")
	requireAPIError(t, w, http.StatusForbidden, "FORBIDDEN")
	w = env.do(t, http.MethodGet, "/api/shares/whatever", nil, "")
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")
}

func TestShares_AuthEnabled(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true, sharingEnabled: true})
	env.setupAdmin(t, "alice")
	env.createDoc(t, "/private", "Private", "only via link")

	w := env.do(t, http.MethodPost, "/api/shares", `{"document_path":"/private"}`, env.token)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var share ShareResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &share))
	assert.Equal(t, "alice", share.CreatedBy)

	// The share link is public, the rest of the API is not.
	w = env.do(t, http.MethodGet, "/api/shares/"+share.Token, nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	w = env.do(t, http.MethodGet, "/api/documents/private", nil, "")
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	w = env.do(t, http.MethodGet, "/api/shares", nil, "")
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	w = env.do(t, http.MethodPost, "/api/shares", `{"document_path":"/private"}`, "")
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	w = env.do(t, http.MethodGet, "/api/shares/"+share.Token+"/extra", nil, "")
	assert.Equal(t, http.StatusUnauthorized, w.Code)

	// Another user neither sees nor revokes Alice's share.
	w = env.do(t, http.MethodPost, "/api/auth/users", `{"username":"bob","credential_id":"cred-bob"}`, env.token)
	require.Equal(t, http.StatusCreated, w.Code)
	bob := tokenFor(t, env, "bob")
	w = env.do(t, http.MethodGet, "/api/shares", nil, bob)
	require.Equal(t, http.StatusOK, w.Code)
	assert.EqualValues(t, 0, decode(t, w)["total"])
	w = env.do(t, http.MethodDelete, "/api/shares/"+share.ID, nil, bob)
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")

	w = env.do(t, http.MethodGet, "/api/shares", nil, env.token)
	assert.EqualValues(t, 1, decode(t, w)["total"])
	w = env.do(t, http.MethodDelete, "/api/shares/"+share.ID, nil, env.token)
	require.Equal(t, http.StatusOK, w.Code)
}

// With auth enabled the share handlers also refuse a request that reached
// them without an authenticated user (defence in depth behind the middleware).
func TestShares_HandlersRequireUserWhenAuthEnabled(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true, sharingEnabled: true})
	h := NewAPIHandler(env.svc)
	router := newBareRouter()
	router.GET("/shares", h.listShares)
	router.DELETE("/shares/:id", h.revokeShare)

	requireAPIError(t, serve(router, newRequest(http.MethodGet, "/shares", "")), http.StatusUnauthorized, "UNAUTHORIZED")
	requireAPIError(t, serve(router, newRequest(http.MethodDelete, "/shares/x", "")), http.StatusUnauthorized, "UNAUTHORIZED")
}

func TestShares_BrokenStoreIsInternalError(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{sharingEnabled: true})
	require.NoError(t, os.WriteFile(filepath.Join(env.dataDir, ".schist", "shares.json"), []byte("{broken"), 0o600))

	for _, r := range []struct{ method, target string }{
		{http.MethodGet, "/api/shares"},
		{http.MethodDelete, "/api/shares/x"},
		{http.MethodPost, "/api/shares/cleanup"},
	} {
		w := env.do(t, r.method, r.target, nil, "")
		resp := requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
		assert.Nil(t, resp.Details, "500s carry no details")
		assert.NotContains(t, resp.Error, "shares.json", "causes are logged, not returned")
	}
}

func TestGitHub_NotConfigured(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})

	w := env.do(t, http.MethodGet, "/api/github/config", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, false, decode(t, w)["enabled"])

	w = env.do(t, http.MethodGet, "/api/github/connection-status", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	status := decode(t, w)
	assert.Equal(t, false, status["token_exists"])
	assert.Equal(t, false, status["connected"])

	w = env.do(t, http.MethodPost, "/api/github/sync", nil, "")
	requireAPIError(t, w, http.StatusBadRequest, "VALIDATION_ERROR")
	w = env.do(t, http.MethodPut, "/api/github/config", `{"auto_sync":true}`, "")
	requireAPIError(t, w, http.StatusBadRequest, "VALIDATION_ERROR")

	w = env.do(t, http.MethodPost, "/api/github/disconnect", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, false, decode(t, w)["status"].(map[string]any)["token_exists"])
}

// The setup and test endpoints validate input before any GitHub call, so these
// cases never touch the network.
func TestGitHub_SetupAndTestValidation(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})

	tests := []struct {
		name string
		body string
		code string
	}{
		{"malformed", `{`, "INVALID_REQUEST"},
		{"missing token", `{"owner":"o","repo":"r"}`, "INVALID_REQUEST"},
		{"blank token", `{"token":"  ","owner":"o","repo":"r"}`, "VALIDATION_ERROR"},
		{"blank owner", `{"token":"t","owner":" ","repo":"r"}`, "VALIDATION_ERROR"},
		{"blank repo", `{"token":"t","owner":"o","repo":"\t"}`, "VALIDATION_ERROR"},
	}
	for _, endpoint := range []string{"/api/github/setup", "/api/github/test"} {
		for _, tt := range tests {
			t.Run(endpoint+" "+tt.name, func(t *testing.T) {
				w := env.do(t, http.MethodPost, endpoint, tt.body, "")
				requireAPIError(t, w, http.StatusBadRequest, tt.code)
			})
		}
	}
	assert.False(t, env.svc.GitHubService.IsEnabled())
}

// enableGitHub marks the integration enabled in the persisted settings
// without a client (no token), as after a restart with a locked store.
func enableGitHub(t *testing.T, env *apiEnv, token *crypto.EncryptedValue) {
	t.Helper()
	require.NoError(t, env.svc.Settings.UpdateGitHubSettings(env.dataDir, &config.GitHubSettings{
		Enabled: true, Owner: "octo", Repository: "wiki", Branch: "main", Token: token,
	}))
}

func TestGitHub_EnabledWithoutClient(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	enableGitHub(t, env, nil)

	w := env.do(t, http.MethodGet, "/api/github/config", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	cfg := decode(t, w)
	assert.Equal(t, true, cfg["enabled"])
	assert.Equal(t, "octo", cfg["owner"])

	// Sync can't build a client without a token: an internal error whose
	// cause stays in the log.
	w = env.do(t, http.MethodPost, "/api/github/sync", nil, "")
	requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")

	w = env.do(t, http.MethodPut, "/api/github/config", `{`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")

	w = env.do(t, http.MethodPut, "/api/github/config", `{"auto_sync":true,"sync_on_save":true,"branch":"dev"}`, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	status := decode(t, w)["status"].(map[string]any)
	assert.Equal(t, "dev", status["branch"])
	assert.Equal(t, true, status["auto_sync"])

	raw, err := os.ReadFile(filepath.Join(env.dataDir, ".schist", "config.json"))
	require.NoError(t, err)
	assert.Contains(t, string(raw), `"branch": "dev"`)

	w = env.do(t, http.MethodPost, "/api/github/disconnect", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.False(t, env.svc.GitHubService.IsEnabled())
	raw, err = os.ReadFile(filepath.Join(env.dataDir, ".schist", "config.json"))
	require.NoError(t, err)
	assert.NotContains(t, string(raw), "octo")
}

func TestGitHub_ConnectionStatusWithEncryptedToken(t *testing.T) {
	t.Run("store locked", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{})
		enableGitHub(t, env, crypto.NewEncryptedValue("ciphertext", true))

		w := env.do(t, http.MethodGet, "/api/github/connection-status", nil, "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		status := decode(t, w)
		assert.Equal(t, true, status["token_exists"])
		assert.Equal(t, false, status["connected"])
	})

	t.Run("store unlocked but token undecryptable", func(t *testing.T) {
		env := unlockedEnv(t)
		enableGitHub(t, env, crypto.NewEncryptedValue("not-real-ciphertext", true))

		w := env.do(t, http.MethodGet, "/api/github/connection-status", nil, env.token)
		requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")

		// Update reports the same failure after saving the config.
		w = env.do(t, http.MethodPut, "/api/github/config", `{"auto_sync":true}`, env.token)
		requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
	})
}

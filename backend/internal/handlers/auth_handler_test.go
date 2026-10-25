package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPasskeyLogin_EndToEnd(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})

	w := env.do(t, http.MethodGet, "/api/auth/setup/required", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, true, decode(t, w)["requires_setup"])

	_, credID := env.setupAdmin(t, "alice")
	assert.FileExists(t, filepath.Join(env.dataDir, ".schist", "passkeys.json"))

	w = env.do(t, http.MethodGet, "/api/auth/setup/required", nil, "")
	assert.Equal(t, false, decode(t, w)["requires_setup"])

	w = env.do(t, http.MethodGet, "/api/auth/me", nil, env.token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	me := decode(t, w)
	assert.Equal(t, "alice", me["username"])
	assert.NotContains(t, me, "passkey_ids", "the user DTO must not leak passkey ids")
	assert.NotContains(t, me, "is_admin")

	w = env.do(t, http.MethodGet, "/api/passkeys", nil, env.token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	passkeys := decode(t, w)["passkeys"].([]any)
	require.Len(t, passkeys, 1)
	assert.Equal(t, credID, passkeys[0].(map[string]any)["id"])
	assert.Equal(t, "admin key", passkeys[0].(map[string]any)["name"])

	w = env.do(t, http.MethodGet, "/api/passkeys/status", nil, env.token)
	require.Equal(t, http.StatusOK, w.Code)
	status := decode(t, w)
	assert.Equal(t, true, status["hasPasskeys"])
	assert.Equal(t, false, status["isUnlocked"])
	assert.Equal(t, false, status["requiresPassword"])

	w = env.do(t, http.MethodPost, "/api/auth/logout", nil, "")
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestPasskeyLogin_TicketIsSingleUse(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	a, _ := env.setupAdmin(t, "alice")

	ticket := env.authTicket(t, a)
	w := env.do(t, http.MethodPost, "/api/auth/login/passkey", map[string]any{"authTicket": ticket}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	w = env.do(t, http.MethodPost, "/api/auth/login/passkey", map[string]any{"authTicket": ticket}, "")
	requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")
}

func TestLoginWithPasskey_Rejections(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	tests := []struct {
		name   string
		body   string
		status int
		code   string
	}{
		{"malformed JSON", `{`, http.StatusBadRequest, "INVALID_REQUEST"},
		{"empty ticket", `{"authTicket":""}`, http.StatusUnauthorized, "UNAUTHORIZED"},
		{"unknown ticket", `{"authTicket":"forged"}`, http.StatusUnauthorized, "UNAUTHORIZED"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := env.do(t, http.MethodPost, "/api/auth/login/passkey", tt.body, "")
			requireAPIError(t, w, tt.status, tt.code)
		})
	}
}

func TestJWTMiddleware_ProtectsAPI(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	tests := []struct {
		name   string
		header string
		status int
	}{
		{"no header", "", http.StatusUnauthorized},
		{"not a bearer token", "Basic abc", http.StatusUnauthorized},
		{"empty bearer token", "Bearer ", http.StatusUnauthorized},
		{"forged token", "Bearer not.a.jwt", http.StatusUnauthorized},
		{"valid token", "Bearer " + env.token, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := newRequest(http.MethodGet, "/api/documents", "")
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			w := serve(env.router, req)
			assert.Equal(t, tt.status, w.Code, w.Body.String())
		})
	}

	// Public endpoints stay reachable without a token.
	for _, target := range []string{"/api/health", "/api/config", "/api/auth/setup/required"} {
		w := env.do(t, http.MethodGet, target, nil, "")
		assert.Equal(t, http.StatusOK, w.Code, target)
	}
	w := env.do(t, http.MethodGet, "/api/config", nil, "")
	assert.Equal(t, true, decode(t, w)["auth_enabled"])
}

func TestGetCurrentUser(t *testing.T) {
	t.Run("auth disabled has no user", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{})
		w := env.do(t, http.MethodGet, "/api/auth/me", nil, "")
		requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")
	})

	t.Run("token for a deleted user", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
		env.setupAdmin(t, "alice")
		require.NoError(t, os.Remove(filepath.Join(env.dataDir, "users.json")))
		w := env.do(t, http.MethodGet, "/api/auth/me", nil, env.token)
		requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")
	})
}

func TestCreateFirstUser(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})

	tests := []struct {
		name   string
		body   string
		status int
		code   string
	}{
		{"malformed JSON", `nope`, http.StatusBadRequest, "INVALID_REQUEST"},
		{"missing username", `{"credential_id":"c"}`, http.StatusBadRequest, "VALIDATION_ERROR"},
		{"missing credential", `{"username":"alice"}`, http.StatusBadRequest, "VALIDATION_ERROR"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := env.do(t, http.MethodPost, "/api/auth/setup/first-user", tt.body, "")
			requireAPIError(t, w, tt.status, tt.code)
		})
	}

	w := env.do(t, http.MethodPost, "/api/auth/setup/first-user", `{"username":"alice","credential_id":"c1"}`, "")
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.Equal(t, "alice", decode(t, w)["username"])

	// Once a user exists, the unauthenticated setup endpoint must not create
	// another (admin) user.
	w = env.do(t, http.MethodPost, "/api/auth/setup/first-user", `{"username":"mallory","credential_id":"c2"}`, "")
	requireAPIError(t, w, http.StatusConflict, "RESOURCE_CONFLICT")
	users, err := env.svc.UserService.ListUsers()
	require.NoError(t, err)
	require.Len(t, users, 1)
	assert.Equal(t, "alice", users[0].Username)
}

func TestAdminEndpoints_RequireAdmin(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	w := env.do(t, http.MethodPost, "/api/auth/users", map[string]any{
		"username": "bob", "credential_id": "cred-bob",
	}, env.token)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	bobToken := tokenFor(t, env, "bob")

	adminRoutes := []struct {
		method, target, body string
	}{
		{http.MethodPost, "/api/auth/invite", `{}`},
		{http.MethodPost, "/api/auth/users", `{"username":"eve","credential_id":"x"}`},
		{http.MethodGet, "/api/auth/users", ""},
		{http.MethodDelete, "/api/auth/users/alice", ""},
	}
	for _, r := range adminRoutes {
		t.Run("non-admin "+r.method+" "+r.target, func(t *testing.T) {
			w := env.do(t, r.method, r.target, r.body, bobToken)
			assert.Equal(t, http.StatusForbidden, w.Code, w.Body.String())
		})
		t.Run("anonymous "+r.method+" "+r.target, func(t *testing.T) {
			w := env.do(t, r.method, r.target, r.body, "")
			assert.Equal(t, http.StatusUnauthorized, w.Code, w.Body.String())
		})
	}

	// Nothing changed.
	users, err := env.svc.UserService.ListUsers()
	require.NoError(t, err)
	assert.Len(t, users, 2)
}

func TestAdminEndpoints_UserManagement(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	w := env.do(t, http.MethodPost, "/api/auth/users", `{"username":"bob","credential_id":"cred-bob","is_admin":true}`, env.token)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	w = env.do(t, http.MethodPost, "/api/auth/users", `{"username":"bob","credential_id":"cred-bob2"}`, env.token)
	requireAPIError(t, w, http.StatusConflict, "RESOURCE_ALREADY_EXISTS")

	w = env.do(t, http.MethodPost, "/api/auth/users", `{`, env.token)
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")

	w = env.do(t, http.MethodGet, "/api/auth/users", nil, env.token)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Len(t, decode(t, w)["users"], 2)

	w = env.do(t, http.MethodDelete, "/api/auth/users/bob", nil, env.token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	w = env.do(t, http.MethodDelete, "/api/auth/users/bob", nil, env.token)
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")

	users, err := env.svc.UserService.ListUsers()
	require.NoError(t, err)
	require.Len(t, users, 1)
	assert.Equal(t, "alice", users[0].Username)
}

func TestInviteFlow(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	w := env.do(t, http.MethodPost, "/api/auth/invite", `{}`, env.token)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	invite := decode(t, w)
	token, _ := invite["token"].(string)
	require.NotEmpty(t, token)
	assert.Equal(t, "http://localhost:5173/setup?invite="+token, invite["invite_url"])

	tests := []struct {
		name   string
		body   string
		status int
		code   string
	}{
		{"malformed JSON", `{`, http.StatusBadRequest, "INVALID_REQUEST"},
		{"missing fields", `{"token":"","username":"","credential_id":""}`, http.StatusBadRequest, "INVALID_REQUEST"},
		{"unknown invite", `{"token":"nope","username":"bob","credential_id":"c"}`, http.StatusBadRequest, "VALIDATION_ERROR"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := env.do(t, http.MethodPost, "/api/auth/setup/invite-user", tt.body, "")
			requireAPIError(t, w, tt.status, tt.code)
		})
	}

	body := `{"token":"` + token + `","username":"bob","credential_id":"cred-bob"}`
	w = env.do(t, http.MethodPost, "/api/auth/setup/invite-user", body, "")
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	bob, err := env.svc.UserService.GetUserByUsername("bob")
	require.NoError(t, err)
	assert.False(t, bob.IsAdmin, "invited users must not be admins")

	// The invite is single-use.
	body = strings.Replace(body, "bob", "carol", 1)
	w = env.do(t, http.MethodPost, "/api/auth/setup/invite-user", body, "")
	requireAPIError(t, w, http.StatusBadRequest, "VALIDATION_ERROR")
}

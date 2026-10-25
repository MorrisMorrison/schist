package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/services"
)

// The user/auth endpoints answer every failure with the typed {error, code}
// envelope: store and I/O failures are a plain 500 whose cause is only logged,
// never a guessed 4xx carrying the internal error text.

// requireNoLeak asserts that a response body carries none of the internal
// details of a failure: file paths, wrapped Go error text or error codes
// spelled into the message.
func requireNoLeak(t *testing.T, e *apiEnv, w *httptest.ResponseRecorder) {
	t.Helper()
	body := w.Body.String()
	for _, leak := range []string{
		"failed to", "caused by", "users file", "users.json", ".json", "invites",
		"no such file", "cannot find", "invalid character", "_ERROR:",
		e.dataDir, filepath.ToSlash(e.dataDir), strings.ReplaceAll(e.dataDir, `\`, `\\`),
	} {
		assert.NotContains(t, body, leak, "response leaks internal text")
	}
}

// corruptUsers replaces the users store with unparseable content.
func (e *apiEnv) corruptUsers(t *testing.T) {
	t.Helper()
	require.NoError(t, os.WriteFile(filepath.Join(e.dataDir, "users.json"), []byte("{corrupt"), 0600))
}

// mount serves a single handler with the given user signed in (empty for
// none), bypassing the auth and admin middleware so a handler can be driven
// against a store that the middleware itself could not read.
func mount(method, route, username string, h gin.HandlerFunc) *gin.Engine {
	router := newBareRouter()
	router.Handle(method, route, func(c *gin.Context) {
		if username != "" {
			c.Set("authenticated_user", username)
		}
		h(c)
	})
	return router
}

// invite issues an invite token through the admin API.
func (e *apiEnv) invite(t *testing.T) string {
	t.Helper()
	w := e.do(t, http.MethodPost, "/api/auth/invite", `{}`, e.token)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	token, _ := decode(t, w)["token"].(string)
	require.NotEmpty(t, token)
	return token
}

func writeInvite(t *testing.T, e *apiEnv, token string, data []byte) {
	t.Helper()
	dir := filepath.Join(e.dataDir, "invites")
	require.NoError(t, os.MkdirAll(dir, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, token+".json"), data, 0600))
}

// wellFormedToken has the shape of an issued invite token (64 hex chars).
var wellFormedToken = strings.Repeat("0123456789abcdef", 4)

func TestUserAuthErrors_CorruptUsersStore(t *testing.T) {
	t.Run("setup status", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
		env.corruptUsers(t)
		w := env.do(t, http.MethodGet, "/api/auth/setup/required", nil, "")
		requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
		requireNoLeak(t, env, w)
	})

	t.Run("first user", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
		env.corruptUsers(t)
		w := env.do(t, http.MethodPost, "/api/auth/setup/first-user", `{"username":"mallory","credential_id":"c"}`, "")
		requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
		requireNoLeak(t, env, w)
	})

	t.Run("user from invite", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
		env.setupAdmin(t, "alice")
		token := env.invite(t)
		env.corruptUsers(t)
		body := `{"token":"` + token + `","username":"bob","credential_id":"c"}`
		w := env.do(t, http.MethodPost, "/api/auth/setup/invite-user", body, "")
		requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
		requireNoLeak(t, env, w)
	})

	t.Run("current user", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
		env.setupAdmin(t, "alice")
		env.corruptUsers(t)
		w := env.do(t, http.MethodGet, "/api/auth/me", nil, env.token)
		requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
		requireNoLeak(t, env, w)
	})

	t.Run("passkey sign-in", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
		a, _ := env.setupAdmin(t, "alice")
		env.corruptUsers(t)

		w := env.do(t, http.MethodPost, "/api/passkeys/authenticate/begin", nil, "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		begin := decode(t, w)
		w = env.do(t, http.MethodPost, "/api/passkeys/authenticate/finish", map[string]any{
			"sessionId": begin["sessionId"],
			"response":  a.Assertion(t, challengeFrom(t, begin)),
		}, "")
		requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
		requireNoLeak(t, env, w)
		assert.NotContains(t, w.Body.String(), "authTicket", "no ticket may be issued")
	})

	t.Run("login with a ticket", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
		a, _ := env.setupAdmin(t, "alice")
		ticket := env.authTicket(t, a)
		env.corruptUsers(t)
		w := env.do(t, http.MethodPost, "/api/auth/login/passkey", map[string]any{"authTicket": ticket}, "")
		requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
		requireNoLeak(t, env, w)
		assert.NotContains(t, w.Body.String(), "token")
	})

	// The admin routes check the caller against the same store, so drive the
	// handlers directly to reach their own store access.
	adminRoutes := []struct {
		name, method, route, target, body string
		handler                           func(*APIHandler) gin.HandlerFunc
	}{
		{"create user", http.MethodPost, "/users", "/users", `{"username":"bob","credential_id":"c"}`,
			func(h *APIHandler) gin.HandlerFunc { return h.createUser }},
		{"list users", http.MethodGet, "/users", "/users", "",
			func(h *APIHandler) gin.HandlerFunc { return h.listUsers }},
		{"delete user", http.MethodDelete, "/users/:username", "/users/bob", "",
			func(h *APIHandler) gin.HandlerFunc { return h.deleteUser }},
	}
	for _, r := range adminRoutes {
		t.Run(r.name, func(t *testing.T) {
			env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
			env.corruptUsers(t)
			router := mount(r.method, r.route, "alice", r.handler(NewAPIHandler(env.svc)))
			w := serve(router, newRequest(r.method, r.target, r.body))
			requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
			requireNoLeak(t, env, w)
		})
	}

	t.Run("passkey list", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
		env.setupAdmin(t, "alice")
		env.corruptUsers(t)
		w := env.do(t, http.MethodGet, "/api/passkeys", nil, env.token)
		requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
		requireNoLeak(t, env, w)
	})
}

func TestUserAuthErrors_UnreadableUsersStore(t *testing.T) {
	// A directory where the users file should be: reading it fails with an
	// OS error naming the path.
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	require.NoError(t, os.Mkdir(filepath.Join(env.dataDir, "users.json"), 0755))

	w := env.do(t, http.MethodPost, "/api/auth/setup/first-user", `{"username":"mallory","credential_id":"c"}`, "")
	requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
	requireNoLeak(t, env, w)

	w = env.do(t, http.MethodGet, "/api/auth/setup/required", nil, "")
	requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
	requireNoLeak(t, env, w)
}

func TestUserAuthErrors_InviteStoreFailure(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")
	// A file where the invites directory should be.
	require.NoError(t, os.WriteFile(filepath.Join(env.dataDir, "invites"), []byte("x"), 0600))

	w := env.do(t, http.MethodPost, "/api/auth/invite", `{}`, env.token)
	requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
	requireNoLeak(t, env, w)
}

func TestUserAuthErrors_Conflicts(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	t.Run("first user when already set up", func(t *testing.T) {
		w := env.do(t, http.MethodPost, "/api/auth/setup/first-user", `{"username":"mallory","credential_id":"c"}`, "")
		requireAPIError(t, w, http.StatusConflict, "RESOURCE_CONFLICT")
		requireNoLeak(t, env, w)
	})

	t.Run("duplicate user", func(t *testing.T) {
		w := env.do(t, http.MethodPost, "/api/auth/users", `{"username":"alice","credential_id":"c"}`, env.token)
		resp := requireAPIError(t, w, http.StatusConflict, "RESOURCE_ALREADY_EXISTS")
		requireNoLeak(t, env, w)
		assert.Equal(t, "alice", resp.Details["identifier"])
	})

	t.Run("duplicate user from invite", func(t *testing.T) {
		body := `{"token":"` + env.invite(t) + `","username":"alice","credential_id":"c"}`
		w := env.do(t, http.MethodPost, "/api/auth/setup/invite-user", body, "")
		requireAPIError(t, w, http.StatusConflict, "RESOURCE_ALREADY_EXISTS")
		requireNoLeak(t, env, w)

		users, err := env.svc.UserService.ListUsers()
		require.NoError(t, err)
		require.Len(t, users, 1)
		assert.True(t, users[0].IsAdmin, "the existing user is untouched")
	})
}

func TestUserAuthErrors_InvalidInput(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	for _, body := range []string{`{"username":"","credential_id":"c"}`, `{"username":"bob","credential_id":""}`} {
		w := env.do(t, http.MethodPost, "/api/auth/users", body, env.token)
		requireAPIError(t, w, http.StatusBadRequest, "VALIDATION_ERROR")
		requireNoLeak(t, env, w)
	}
	users, err := env.svc.UserService.ListUsers()
	require.NoError(t, err)
	assert.Len(t, users, 1)
}

func TestUserAuthErrors_MissingUser(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	w := env.do(t, http.MethodDelete, "/api/auth/users/nobody", nil, env.token)
	resp := requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")
	requireNoLeak(t, env, w)
	assert.Equal(t, "nobody", resp.Details["identifier"])

	ghost := tokenFor(t, env, "ghost")
	w = env.do(t, http.MethodGet, "/api/auth/me", nil, ghost)
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")
	requireNoLeak(t, env, w)

	w = env.do(t, http.MethodGet, "/api/passkeys", nil, ghost)
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")
	requireNoLeak(t, env, w)
}

func TestUserAuthErrors_InviteTokens(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	expired, err := json.Marshal(services.Invite{Token: wellFormedToken, ExpiresAt: time.Now().Add(-time.Minute), CreatedBy: "alice"})
	require.NoError(t, err)
	corruptToken := strings.Repeat("fedcba9876543210", 4)
	writeInvite(t, env, wellFormedToken, expired)
	writeInvite(t, env, corruptToken, []byte("{broken"))

	tests := []struct {
		name   string
		token  string
		status int
		code   string
	}{
		{"malformed token", "../users", http.StatusBadRequest, "VALIDATION_ERROR"},
		{"unknown token", strings.Repeat("a", 64), http.StatusBadRequest, "VALIDATION_ERROR"},
		{"expired token", wellFormedToken, http.StatusBadRequest, "VALIDATION_ERROR"},
		{"corrupt invite file", corruptToken, http.StatusInternalServerError, "INTERNAL_ERROR"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := `{"token":"` + tt.token + `","username":"bob","credential_id":"c"}`
			w := env.do(t, http.MethodPost, "/api/auth/setup/invite-user", body, "")
			requireAPIError(t, w, tt.status, tt.code)
			requireNoLeak(t, env, w)
		})
	}

	_, err = env.svc.UserService.GetUserByUsername("bob")
	assert.Error(t, err, "no invite failure may create the user")
}

func TestUserAuthErrors_Unauthenticated(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	a, _ := env.setupAdmin(t, "alice")

	w := env.do(t, http.MethodPost, "/api/auth/login/passkey", `{"authTicket":"forged"}`, "")
	resp := requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")
	assert.Equal(t, "Authentication failed", resp.Error)
	requireNoLeak(t, env, w)

	// A ticket whose credential no longer maps to a user is rejected the same
	// way as a forged one: user existence never leaks on the login path.
	ticket := env.authTicket(t, a)
	require.NoError(t, os.WriteFile(filepath.Join(env.dataDir, "users.json"), []byte(`{"users":[]}`), 0600))
	w = env.do(t, http.MethodPost, "/api/auth/login/passkey", map[string]any{"authTicket": ticket}, "")
	resp = requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")
	assert.Equal(t, "Authentication failed", resp.Error)
	requireNoLeak(t, env, w)

	w = env.do(t, http.MethodPost, "/api/passkeys/authenticate/begin", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	begin := decode(t, w)
	w = env.do(t, http.MethodPost, "/api/passkeys/authenticate/finish", map[string]any{
		"sessionId": begin["sessionId"],
		"response":  a.Assertion(t, challengeFrom(t, begin)),
	}, "")
	resp = requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")
	assert.Equal(t, "Authentication failed", resp.Error)
	requireNoLeak(t, env, w)
}

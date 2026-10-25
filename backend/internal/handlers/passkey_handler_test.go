package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPasskeyRegistration_Validation(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})

	w := env.do(t, http.MethodPost, "/api/passkeys/register/begin", `{`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")
	w = env.do(t, http.MethodPost, "/api/passkeys/register/begin", `{}`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")

	w = env.do(t, http.MethodPost, "/api/passkeys/register/finish", `{"name":"x"}`, "")
	requireAPIError(t, w, http.StatusBadRequest, "INVALID_REQUEST")

	a := newSoftAuthenticator(t)
	w = env.do(t, http.MethodPost, "/api/passkeys/register/finish", map[string]any{
		"name": "x", "sessionId": "session_unknown", "response": a.attestation(t, "AAAA"),
	}, "")
	requireAPIError(t, w, http.StatusBadRequest, "VALIDATION_ERROR")

	begin := func() map[string]any {
		w := env.do(t, http.MethodPost, "/api/passkeys/register/begin", `{"name":"x"}`, "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		return decode(t, w)
	}

	// A response that is not a WebAuthn attestation at all.
	b := begin()
	w = env.do(t, http.MethodPost, "/api/passkeys/register/finish", map[string]any{
		"name": "x", "sessionId": b["sessionId"], "response": map[string]any{"id": "nope"},
	}, "")
	requireAPIError(t, w, http.StatusBadRequest, "VALIDATION_ERROR")

	// A well-formed attestation over the wrong challenge must not verify.
	b = begin()
	w = env.do(t, http.MethodPost, "/api/passkeys/register/finish", map[string]any{
		"name": "x", "sessionId": b["sessionId"], "response": a.attestation(t, b64url.EncodeToString([]byte("not-the-challenge-0123456789abcd"))),
	}, "")
	requireAPIError(t, w, http.StatusBadRequest, "VALIDATION_ERROR")

	// Sessions are single-use: replaying a consumed session fails.
	b = begin()
	body := map[string]any{"name": "x", "sessionId": b["sessionId"], "response": a.attestation(t, challengeFrom(t, b))}
	w = env.do(t, http.MethodPost, "/api/passkeys/register/finish", body, "")
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	w = env.do(t, http.MethodPost, "/api/passkeys/register/finish", body, "")
	requireAPIError(t, w, http.StatusBadRequest, "VALIDATION_ERROR")
}

// After first-time setup, an anonymous visitor must not be able to enroll a
// passkey (account takeover).
func TestPasskeyRegistration_RequiresAuthAfterSetup(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	w := env.do(t, http.MethodPost, "/api/passkeys/register/begin", `{"name":"evil"}`, "")
	requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")

	a := newSoftAuthenticator(t)
	w = env.do(t, http.MethodPost, "/api/passkeys/register/finish", map[string]any{
		"name": "evil", "sessionId": "session_x", "response": a.attestation(t, "AAAA"),
	}, "")
	requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")

	// A forged token does not count as authenticated either.
	w = env.do(t, http.MethodPost, "/api/passkeys/register/begin", `{"name":"evil"}`, "forged.token.value")
	requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")

	creds, err := env.svc.PasskeyService.ListCredentials()
	require.NoError(t, err)
	assert.Len(t, creds, 1)
}

// A signed-in user adds a second passkey to their own account (the
// PasskeySetupModal flow). The new passkey must be listed and usable to log in.
func TestPasskeyRegistration_SignedInUserAddsPasskey(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	second := newSoftAuthenticator(t)
	credID := env.registerPasskey(t, second, "phone", env.token)

	w := env.do(t, http.MethodGet, "/api/passkeys", nil, env.token)
	require.Equal(t, http.StatusOK, w.Code)
	var list PasskeyListResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &list))
	ids := []string{}
	for _, p := range list.Passkeys {
		ids = append(ids, p.ID)
	}
	assert.Contains(t, ids, credID)
	assert.Len(t, ids, 2)

	token := env.login(t, second)
	w = env.do(t, http.MethodGet, "/api/auth/me", nil, token)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "alice", decode(t, w)["username"])
}

func TestPasskeyAuthentication_Failures(t *testing.T) {
	t.Run("no passkeys registered", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
		w := env.do(t, http.MethodPost, "/api/passkeys/authenticate/begin", nil, "")
		requireAPIError(t, w, http.StatusConflict, "INVALID_STATE")
	})

	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	a, _ := env.setupAdmin(t, "alice")
	begin := func() map[string]any {
		w := env.do(t, http.MethodPost, "/api/passkeys/authenticate/begin", nil, "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		return decode(t, w)
	}
	finish := func(body any) *httptest.ResponseRecorder {
		return env.do(t, http.MethodPost, "/api/passkeys/authenticate/finish", body, "")
	}

	requireAPIError(t, finish(`{`), http.StatusBadRequest, "INVALID_REQUEST")
	requireAPIError(t, finish(map[string]any{"sessionId": "session_unknown", "response": a.assertion(t, "AAAA")}),
		http.StatusBadRequest, "VALIDATION_ERROR")

	b := begin()
	requireAPIError(t, finish(map[string]any{"sessionId": b["sessionId"], "response": map[string]any{"id": "x"}}),
		http.StatusBadRequest, "VALIDATION_ERROR")

	// An assertion signed by a key the server doesn't know.
	stranger := newSoftAuthenticator(t)
	b = begin()
	requireAPIError(t, finish(map[string]any{"sessionId": b["sessionId"], "response": stranger.assertion(t, challengeFrom(t, b))}),
		http.StatusUnauthorized, "UNAUTHORIZED")

	// The right key over the wrong challenge.
	b = begin()
	requireAPIError(t, finish(map[string]any{"sessionId": b["sessionId"], "response": a.assertion(t, b64url.EncodeToString([]byte("wrong-challenge-0123456789abcdef")))}),
		http.StatusUnauthorized, "UNAUTHORIZED")
}

// A verified passkey that isn't bound to any user gets no auth ticket.
func TestPasskeyAuthentication_UnboundCredentialGetsNoTicket(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	a := newSoftAuthenticator(t)
	env.registerPasskey(t, a, "orphan", "") // first-time setup, but no user created

	w := env.do(t, http.MethodPost, "/api/passkeys/authenticate/begin", nil, "")
	require.Equal(t, http.StatusOK, w.Code)
	b := decode(t, w)
	w = env.do(t, http.MethodPost, "/api/passkeys/authenticate/finish", map[string]any{
		"sessionId": b["sessionId"], "response": a.assertion(t, challengeFrom(t, b)),
	}, "")
	requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")
}

func TestListPasskeys_Errors(t *testing.T) {
	t.Run("no authenticated user", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{})
		w := env.do(t, http.MethodGet, "/api/passkeys", nil, "")
		requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")
	})
	t.Run("unknown user", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
		env.setupAdmin(t, "alice")
		w := env.do(t, http.MethodGet, "/api/passkeys", nil, tokenFor(t, env, "ghost"))
		requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")
	})
}

func TestDeletePasskey(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	_, aliceCred := env.setupAdmin(t, "alice")

	w := env.do(t, http.MethodPost, "/api/auth/users", `{"username":"bob","credential_id":"cred-bob"}`, env.token)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	bobToken := tokenFor(t, env, "bob")

	// Bob can't delete Alice's passkey.
	w = env.do(t, http.MethodDelete, "/api/passkeys/"+aliceCred, nil, bobToken)
	requireAPIError(t, w, http.StatusForbidden, "FORBIDDEN")

	// Bob owns cred-bob, but it isn't in the passkey store.
	w = env.do(t, http.MethodDelete, "/api/passkeys/cred-bob", nil, bobToken)
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")

	w = env.do(t, http.MethodDelete, "/api/passkeys/"+aliceCred, nil, tokenFor(t, env, "ghost"))
	requireAPIError(t, w, http.StatusNotFound, "RESOURCE_NOT_FOUND")

	w = env.do(t, http.MethodDelete, "/api/passkeys/"+aliceCred, nil, env.token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	has, err := env.svc.PasskeyService.HasCredentials()
	require.NoError(t, err)
	assert.False(t, has)

	t.Run("no authenticated user", func(t *testing.T) {
		env := newAPIEnv(t, apiEnvOptions{})
		w := env.do(t, http.MethodDelete, "/api/passkeys/abc", nil, "")
		requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")
	})
}

func TestPasskeyStatus_BrokenStore(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	require.NoError(t, os.WriteFile(filepath.Join(env.dataDir, ".schist", "passkeys.json"), []byte("{not json"), 0o600))

	w := env.do(t, http.MethodGet, "/api/passkeys/status", nil, "")
	requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
	w = env.do(t, http.MethodPost, "/api/passkeys/authenticate/begin", nil, "")
	requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
	w = env.do(t, http.MethodPost, "/api/passkeys/register/begin", `{"name":"x"}`, "")
	requireAPIError(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
}

func TestUnlockWithPasskey(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	a, _ := env.setupAdmin(t, "alice")

	w := env.do(t, http.MethodPost, "/api/passkeys/unlock", map[string]any{"authTicket": env.authTicket(t, a)}, env.token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.True(t, env.svc.SecretManager.IsUnlocked())

	// A ticket for Alice's passkey can't unlock on Bob's session.
	env.svc.SecretManager.Lock()
	w = env.do(t, http.MethodPost, "/api/auth/users", `{"username":"bob","credential_id":"cred-bob"}`, env.token)
	require.Equal(t, http.StatusCreated, w.Code)
	w = env.do(t, http.MethodPost, "/api/passkeys/unlock", map[string]any{"authTicket": env.authTicket(t, a)}, tokenFor(t, env, "bob"))
	requireAPIError(t, w, http.StatusForbidden, "FORBIDDEN")
	assert.False(t, env.svc.SecretManager.IsUnlocked())
}

// A ticket whose passkey was deleted between authentication and unlock.
func TestUnlockWithPasskey_UnknownPasskey(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	a, credID := env.setupAdmin(t, "alice")
	ticket := env.authTicket(t, a)
	require.NoError(t, env.svc.PasskeyService.DeleteCredential(credID))

	w := env.do(t, http.MethodPost, "/api/passkeys/unlock", map[string]any{"authTicket": ticket}, env.token)
	requireAPIError(t, w, http.StatusUnauthorized, "UNAUTHORIZED")
}

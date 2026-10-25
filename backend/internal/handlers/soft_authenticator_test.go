package handlers

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/testutil"
)

// challengeFrom extracts publicKey.challenge from a begin-* response.
func challengeFrom(t *testing.T, body map[string]any) string {
	t.Helper()
	options, ok := body["options"].(map[string]any)
	require.True(t, ok, "options missing: %v", body)
	publicKey, ok := options["publicKey"].(map[string]any)
	require.True(t, ok, "publicKey missing: %v", options)
	challenge, ok := publicKey["challenge"].(string)
	require.True(t, ok)
	return challenge
}

// registerPasskey runs register/begin + register/finish and returns the
// stored credential ID.
func (e *apiEnv) registerPasskey(t *testing.T, a *testutil.SoftAuthenticator, name, token string) string {
	t.Helper()
	w := e.do(t, http.MethodPost, "/api/passkeys/register/begin", map[string]any{"name": name}, token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	begin := decode(t, w)

	w = e.do(t, http.MethodPost, "/api/passkeys/register/finish", map[string]any{
		"name":      name,
		"sessionId": begin["sessionId"],
		"response":  a.Attestation(t, challengeFrom(t, begin)),
	}, token)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	credentialID, _ := decode(t, w)["credentialId"].(string)
	require.NotEmpty(t, credentialID)
	return credentialID
}

// authTicket runs authenticate/begin + authenticate/finish and returns the
// single-use auth ticket.
func (e *apiEnv) authTicket(t *testing.T, a *testutil.SoftAuthenticator) string {
	t.Helper()
	w := e.do(t, http.MethodPost, "/api/passkeys/authenticate/begin", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	begin := decode(t, w)

	w = e.do(t, http.MethodPost, "/api/passkeys/authenticate/finish", map[string]any{
		"sessionId": begin["sessionId"],
		"response":  a.Assertion(t, challengeFrom(t, begin)),
	}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	ticket, _ := decode(t, w)["authTicket"].(string)
	require.NotEmpty(t, ticket)
	return ticket
}

// login exchanges a fresh auth ticket for a JWT.
func (e *apiEnv) login(t *testing.T, a *testutil.SoftAuthenticator) string {
	t.Helper()
	w := e.do(t, http.MethodPost, "/api/auth/login/passkey", map[string]any{"authTicket": e.authTicket(t, a)}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	token, _ := decode(t, w)["token"].(string)
	require.NotEmpty(t, token)
	return token
}

// setupAdmin registers a passkey during first-time setup, creates the first
// (admin) user bound to it and logs in. The env's token is set to the JWT.
func (e *apiEnv) setupAdmin(t *testing.T, username string) (*testutil.SoftAuthenticator, string) {
	t.Helper()
	a := testutil.NewSoftAuthenticator(t)
	credID := e.registerPasskey(t, a, "admin key", "")
	w := e.do(t, http.MethodPost, "/api/auth/setup/first-user", map[string]any{
		"username":      username,
		"credential_id": credID,
	}, "")
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	e.token = e.login(t, a)
	return a, credID
}

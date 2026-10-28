package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// createAPIToken creates a personal access token with the env's session.
func (e *apiEnv) createAPIToken(t *testing.T, scope string) (raw, id string) {
	t.Helper()
	w := e.request(t, http.MethodPost, "/api/tokens", map[string]any{"name": "test " + scope, "scope": scope})
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	body := decode(t, w)
	return body["token"].(string), body["info"].(map[string]any)["id"].(string)
}

func TestTokens_CreateListRevoke(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")

	raw, id := env.createAPIToken(t, "read")
	assert.Regexp(t, `^sch_[A-Za-z0-9_-]{40,}$`, raw)

	w := env.request(t, http.MethodGet, "/api/tokens", nil)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.NotContains(t, w.Body.String(), raw, "the raw token is shown only once")
	assert.NotContains(t, w.Body.String(), `"hash"`)
	tokens := decode(t, w)["tokens"].([]any)
	require.Len(t, tokens, 1)
	assert.Equal(t, "read", tokens[0].(map[string]any)["scope"])

	requireAPIError(t, env.request(t, http.MethodPost, "/api/tokens", map[string]any{"name": "x", "scope": "admin"}),
		http.StatusBadRequest, "")

	w = env.request(t, http.MethodDelete, "/api/tokens/"+id, nil)
	require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
	requireAPIError(t, env.request(t, http.MethodDelete, "/api/tokens/"+id, nil), http.StatusNotFound, "RESOURCE_NOT_FOUND")

	assert.Equal(t, http.StatusUnauthorized, env.do(t, http.MethodGet, "/api/documents", nil, raw).Code,
		"a revoked token stops working")
}

func TestTokens_NeedAuthEnabled(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	requireAPIError(t, env.do(t, http.MethodPost, "/api/tokens", map[string]any{"name": "x", "scope": "read"}, ""),
		http.StatusConflict, "")
}

func TestTokens_ScopeAndAllowlist(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")
	env.createDoc(t, "/doc", "Doc", "body")
	readToken, _ := env.createAPIToken(t, "read")
	writeToken, _ := env.createAPIToken(t, "read-write")

	update := map[string]any{"metaData": map[string]any{"title": "Doc", "path": "/doc"}, "content": "changed"}

	// Both tokens can read documents and search.
	for _, tok := range []string{readToken, writeToken} {
		assert.Equal(t, http.StatusOK, env.do(t, http.MethodGet, "/api/documents/doc", nil, tok).Code)
		assert.Equal(t, http.StatusOK, env.do(t, http.MethodGet, "/api/search?q=body", nil, tok).Code)
	}

	// Only the read-write token can change them.
	w := env.do(t, http.MethodPut, "/api/documents/doc", update, readToken)
	assert.Equal(t, http.StatusForbidden, w.Code, w.Body.String())
	assert.Contains(t, w.Body.String(), "read-only")
	assert.Equal(t, http.StatusOK, env.do(t, http.MethodPut, "/api/documents/doc", update, writeToken).Code)

	// Account, secrets and settings endpoints need a signed-in session.
	for _, target := range []string{"/api/auth/me", "/api/secrets", "/api/secrets/status", "/api/passkeys",
		"/api/tokens", "/api/github/config", "/api/shares", "/api/auth/users"} {
		w := env.do(t, http.MethodGet, target, nil, writeToken)
		assert.Equal(t, http.StatusForbidden, w.Code, "%s: %s", target, w.Body.String())
	}
	w = env.do(t, http.MethodPost, "/api/tokens", map[string]any{"name": "x", "scope": "read"}, writeToken)
	assert.Equal(t, http.StatusForbidden, w.Code, "a token can't mint tokens")
}

// On public endpoints a token must not identify the caller: passkey
// registration would otherwise let a token holder add a passkey to the account.
func TestTokens_DoNotAuthorizePasskeyRegistration(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true})
	env.setupAdmin(t, "alice")
	writeToken, _ := env.createAPIToken(t, "read-write")

	begin := map[string]any{"name": "attacker key"}
	assert.Equal(t, http.StatusOK, env.request(t, http.MethodPost, "/api/passkeys/register/begin", begin).Code,
		"a signed-in session may add a passkey")
	w := env.do(t, http.MethodPost, "/api/passkeys/register/begin", begin, writeToken)
	assert.Equal(t, http.StatusUnauthorized, w.Code, w.Body.String())
}

// mcpSession connects an MCP client to the env's router over HTTP.
func mcpSession(t *testing.T, env *apiEnv, token string) (*mcp.ClientSession, error) {
	t.Helper()
	srv := httptest.NewServer(env.router)
	t.Cleanup(srv.Close)
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client"}, nil)
	transport := &mcp.StreamableClientTransport{
		Endpoint:   srv.URL + "/api/mcp",
		HTTPClient: &http.Client{Transport: bearer{token: token}},
		MaxRetries: -1,
	}
	session, err := client.Connect(context.Background(), transport, nil)
	if err == nil {
		t.Cleanup(func() { _ = session.Close() })
	}
	return session, err
}

type bearer struct{ token string }

func (b bearer) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	if b.token != "" {
		r.Header.Set("Authorization", "Bearer "+b.token)
	}
	return http.DefaultTransport.RoundTrip(r)
}

func mcpToolNames(t *testing.T, cs *mcp.ClientSession) []string {
	t.Helper()
	res, err := cs.ListTools(context.Background(), nil)
	require.NoError(t, err)
	var names []string
	for _, tool := range res.Tools {
		names = append(names, tool.Name)
	}
	sort.Strings(names)
	return names
}

func TestMCP_OverHTTPWithTokens(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true, mcpEnabled: true})
	env.setupAdmin(t, "alice")
	env.createDoc(t, "/guides/deploy", "Deployment checklist", "Run the migrations first.")
	readToken, _ := env.createAPIToken(t, "read")
	writeToken, _ := env.createAPIToken(t, "read-write")

	_, err := mcpSession(t, env, "")
	assert.Error(t, err, "no token: 401")
	_, err = mcpSession(t, env, "sch_not-a-real-token")
	assert.Error(t, err, "unknown token: 401")

	read, err := mcpSession(t, env, readToken)
	require.NoError(t, err)
	assert.Equal(t, []string{"get_backlinks", "list_folder", "list_tags", "read_document", "search"}, mcpToolNames(t, read))
	_, err = read.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "create_document", Arguments: map[string]any{"path": "/x", "content": "x"},
	})
	assert.Error(t, err, "a read-only token can't call write tools")

	write, err := mcpSession(t, env, writeToken)
	require.NoError(t, err)
	assert.Len(t, mcpToolNames(t, write), 8)

	res, err := write.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "create_document", Arguments: map[string]any{"path": "/notes/from-agent", "content": "Written over MCP about zeppelins."},
	})
	require.NoError(t, err)
	require.False(t, res.IsError)

	res, err = read.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "search", Arguments: map[string]any{"query": "zeppelins"},
	})
	require.NoError(t, err)
	require.False(t, res.IsError)
	assert.Contains(t, res.Content[0].(*mcp.TextContent).Text, "/notes/from-agent")
}

func TestMCP_SignedInSessionGetsAllTools(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{authEnabled: true, mcpEnabled: true})
	env.setupAdmin(t, "alice")

	cs, err := mcpSession(t, env, env.token)
	require.NoError(t, err)
	assert.Len(t, mcpToolNames(t, cs), 8)
}

func TestMCP_OpenWithoutAuthAndOffByDefault(t *testing.T) {
	open := newAPIEnv(t, apiEnvOptions{mcpEnabled: true})
	cs, err := mcpSession(t, open, "")
	require.NoError(t, err, "auth disabled: no token needed")
	assert.Len(t, mcpToolNames(t, cs), 8)

	off := newAPIEnv(t, apiEnvOptions{})
	assert.Equal(t, http.StatusNotFound, off.do(t, http.MethodPost, "/api/mcp", `{}`, "").Code)
	w := off.do(t, http.MethodGet, "/api/config", nil, "")
	assert.Equal(t, false, decode(t, w)["mcp_enabled"])
}

package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/middleware"
	"github.com/MorrisMorrison/schist/internal/services"
)

// apiEnv is a full HTTP stack for handler tests: the real services container
// built against a temp data dir, the same middleware chain main.go installs
// (minus CORS, rate limiting and security headers) and every route from
// SetupAPIRoutes.
type apiEnv struct {
	router  *gin.Engine
	svc     *services.Services
	dataDir string
	// token is sent by helpers such as createDoc (set it after logging in).
	token string
}

type apiEnvOptions struct {
	authEnabled    bool
	sharingEnabled bool
}

func newAPIEnv(t *testing.T, opts apiEnvOptions) *apiEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dataDir := t.TempDir()

	boolEnv := func(b bool) string {
		if b {
			return "true"
		}
		return "false"
	}
	t.Setenv("ENV", "development")
	t.Setenv("SCHIST_DATA_DIR", dataDir)
	t.Setenv("SCHIST_JWT_SECRET", "handler-test-secret-that-is-long-enough-0123456789")
	t.Setenv("SCHIST_AUTH_ENABLED", boolEnv(opts.authEnabled))
	t.Setenv("SCHIST_SHARING_ENABLED", boolEnv(opts.sharingEnabled))
	t.Setenv("SCHIST_FRONTEND_URL", "http://localhost:5173")
	t.Setenv("SCHIST_TEMPLATES_DIR", filepath.Join("..", "..", "..", "templates"))

	svc, err := services.NewServices()
	require.NoError(t, err)

	router := gin.New()
	router.Use(RecoverMiddleware())
	router.Use(ValidationMiddleware())
	router.Use(middleware.JWTMiddleware(svc.AuthService, svc.Config))
	NewAPIHandler(svc).SetupAPIRoutes(router.Group("/api"))

	return &apiEnv{router: router, svc: svc, dataDir: dataDir}
}

// do sends a JSON request (body may be nil, a raw string, or a value to
// marshal) with an optional bearer token.
func (e *apiEnv) do(t *testing.T, method, target string, body any, token string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	switch b := body.(type) {
	case nil:
		reader = bytes.NewReader(nil)
	case string:
		reader = bytes.NewReader([]byte(b))
	default:
		data, err := json.Marshal(b)
		require.NoError(t, err)
		reader = bytes.NewReader(data)
	}
	req := httptest.NewRequest(method, target, reader)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	e.router.ServeHTTP(w, req)
	return w
}

// request sends a JSON request as the env's current user (e.token).
func (e *apiEnv) request(t *testing.T, method, target string, body any) *httptest.ResponseRecorder {
	t.Helper()
	return e.do(t, method, target, body, e.token)
}

// decode unmarshals a JSON response body into a generic map.
func decode(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out), w.Body.String())
	return out
}

// requireAPIError asserts the status and the {error, code} envelope.
func requireAPIError(t *testing.T, w *httptest.ResponseRecorder, status int, code string) ErrorResponse {
	t.Helper()
	require.Equal(t, status, w.Code, w.Body.String())
	var resp ErrorResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp), w.Body.String())
	require.NotEmpty(t, resp.Error)
	if code != "" {
		require.Equal(t, code, resp.Code, w.Body.String())
	}
	return resp
}

// createDoc creates a document through the API.
func (e *apiEnv) createDoc(t *testing.T, path, title, content string, tags ...string) {
	t.Helper()
	meta := map[string]any{"title": title, "path": path}
	if len(tags) > 0 {
		meta["tags"] = tags
	}
	w := e.do(t, http.MethodPost, "/api/documents", map[string]any{"metaData": meta, "content": content}, e.token)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
}

func newRequest(method, target, body string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func serve(router http.Handler, req *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

// tokenFor signs a JWT for username the same way AuthService does, for tests
// that need a session for a user without a passkey of their own.
func tokenFor(t *testing.T, e *apiEnv, username string) string {
	t.Helper()
	claims := services.Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "schist",
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(e.svc.Config.JWTSecret))
	require.NoError(t, err)
	return token
}

// newBareRouter is a gin engine with only the recover middleware, for
// mounting individual handlers.
func newBareRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RecoverMiddleware())
	return router
}

func newTemplateServiceFor(e *apiEnv) *services.TemplateService {
	return services.NewTemplateService(e.svc.Config)
}

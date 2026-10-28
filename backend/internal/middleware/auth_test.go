package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/services"
)

const testJWTSecret = "middleware-test-secret-0123456789abcdef" // gitleaks:allow (test-only value)

func signToken(t *testing.T, secret, username string, expires time.Time, method jwt.SigningMethod) string {
	t.Helper()
	claims := services.Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expires),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "schist",
		},
	}
	var key any = []byte(secret)
	if method == jwt.SigningMethodNone {
		key = jwt.UnsafeAllowNoneSignatureType
	}
	token, err := jwt.NewWithClaims(method, claims).SignedString(key)
	require.NoError(t, err)
	return token
}

// newAuthRouter mounts the JWT middleware in front of handlers that echo the
// authenticated user (or "" when none was set).
func newAuthRouter(t *testing.T, authEnabled bool) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{AuthEnabled: authEnabled, JWTSecret: testJWTSecret, JWTExpiryHours: 1}
	authService := services.NewAuthService(cfg, services.NewUserService(t.TempDir()))

	router := gin.New()
	router.Use(JWTMiddleware(authService, nil, cfg))
	echo := func(c *gin.Context) {
		user, _ := c.Get("authenticated_user")
		name, _ := user.(string)
		c.JSON(http.StatusOK, gin.H{"user": name})
	}
	router.Any("/*path", echo)
	return router
}

func call(router http.Handler, method, target, authorization string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func userOf(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]string
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body), w.Body.String())
	return body["user"]
}

func TestJWTMiddleware_ProtectedEndpoints(t *testing.T) {
	router := newAuthRouter(t, true)
	valid := signToken(t, testJWTSecret, "alice", time.Now().Add(time.Hour), jwt.SigningMethodHS256)

	tests := []struct {
		name          string
		authorization string
		status        int
		user          string
	}{
		{"valid token", "Bearer " + valid, http.StatusOK, "alice"},
		{"missing header", "", http.StatusUnauthorized, ""},
		{"wrong scheme", "Token " + valid, http.StatusUnauthorized, ""},
		{"bearer without token", "Bearer ", http.StatusUnauthorized, ""},
		{"garbage", "Bearer garbage", http.StatusUnauthorized, ""},
		{"wrong secret", "Bearer " + signToken(t, "another-secret-0123456789abcdef!!", "alice", time.Now().Add(time.Hour), jwt.SigningMethodHS256), http.StatusUnauthorized, ""},
		{"expired", "Bearer " + signToken(t, testJWTSecret, "alice", time.Now().Add(-time.Minute), jwt.SigningMethodHS256), http.StatusUnauthorized, ""},
		{"alg none", "Bearer " + signToken(t, testJWTSecret, "alice", time.Now().Add(time.Hour), jwt.SigningMethodNone), http.StatusUnauthorized, ""},
		{"other HMAC alg", "Bearer " + signToken(t, testJWTSecret, "alice", time.Now().Add(time.Hour), jwt.SigningMethodHS512), http.StatusUnauthorized, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := call(router, http.MethodGet, "/api/documents", tt.authorization)
			require.Equal(t, tt.status, w.Code, w.Body.String())
			if tt.status == http.StatusOK {
				assert.Equal(t, tt.user, userOf(t, w))
			} else {
				var body map[string]string
				require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
				assert.Equal(t, "Unauthorized", body["error"])
			}
		})
	}
}

func TestJWTMiddleware_Bypasses(t *testing.T) {
	router := newAuthRouter(t, true)

	tests := []struct {
		name   string
		method string
		target string
		status int
	}{
		{"preflight", http.MethodOptions, "/api/documents", http.StatusOK},
		{"non-api path", http.MethodGet, "/index.html", http.StatusOK},
		{"public health", http.MethodGet, "/api/health", http.StatusOK},
		{"public passkey begin", http.MethodPost, "/api/passkeys/authenticate/begin", http.StatusOK},
		{"shared document by token", http.MethodGet, "/api/shares/abc123", http.StatusOK},
		{"share listing is private", http.MethodGet, "/api/shares/", http.StatusUnauthorized},
		{"nested share path is private", http.MethodGet, "/api/shares/abc/def", http.StatusUnauthorized},
		{"revoking a share is private", http.MethodDelete, "/api/shares/abc123", http.StatusUnauthorized},
		{"lookalike public path", http.MethodGet, "/api/healthz", http.StatusUnauthorized},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := call(router, tt.method, tt.target, "")
			assert.Equal(t, tt.status, w.Code, w.Body.String())
		})
	}
}

// Public endpoints don't require a token but still identify a caller who
// sends a valid one; an invalid token is simply ignored there.
func TestJWTMiddleware_PublicEndpointIdentifiesValidCaller(t *testing.T) {
	router := newAuthRouter(t, true)
	valid := signToken(t, testJWTSecret, "alice", time.Now().Add(time.Hour), jwt.SigningMethodHS256)

	w := call(router, http.MethodPost, "/api/passkeys/register/begin", "Bearer "+valid)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "alice", userOf(t, w))

	w = call(router, http.MethodPost, "/api/passkeys/register/begin", "Bearer forged")
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "", userOf(t, w))

	w = call(router, http.MethodPost, "/api/passkeys/register/begin", "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "", userOf(t, w))
}

func TestJWTMiddleware_AuthDisabled(t *testing.T) {
	router := newAuthRouter(t, false)
	valid := signToken(t, testJWTSecret, "alice", time.Now().Add(time.Hour), jwt.SigningMethodHS256)

	w := call(router, http.MethodGet, "/api/documents", "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "", userOf(t, w))

	// With auth off no identity is attached, even on public endpoints.
	w = call(router, http.MethodPost, "/api/passkeys/register/begin", "Bearer "+valid)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "", userOf(t, w))
}

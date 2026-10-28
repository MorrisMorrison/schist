package middleware

import (
	"net/http"
	"strings"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-gonic/gin"
)

// Context keys set for authenticated requests.
const (
	// AuthMethodKey is AuthMethodSession or AuthMethodToken.
	AuthMethodKey = "auth_method"
	// TokenScopeKey holds a personal access token's scope.
	TokenScopeKey = "token_scope"

	AuthMethodSession = "session"
	AuthMethodToken   = "token"
)

// MCPPath is exempt from the read-only method check: every MCP call is a
// POST, and the MCP server itself hides write tools from read-only tokens.
const MCPPath = "/api/mcp"

type JWTAuth struct {
	authService     *services.AuthService
	tokenService    *services.TokenService
	config          *config.Config
	publicEndpoints []string
}

func NewJWTAuth(authService *services.AuthService, tokenService *services.TokenService, config *config.Config) *JWTAuth {
	return &JWTAuth{
		authService:  authService,
		tokenService: tokenService,
		config:       config,
		publicEndpoints: []string{
			"/api/health",
			"/api/config",
			"/api/auth/login",
			"/api/auth/logout",
			"/api/auth/login/passkey",
			"/api/auth/setup/required",
			"/api/auth/setup/first-user",
			"/api/auth/setup/invite-user",
			"/api/passkeys/register/begin",
			"/api/passkeys/register/finish",
			"/api/passkeys/authenticate/begin",
			"/api/passkeys/authenticate/finish",
		},
	}
}

func (ja *JWTAuth) isPublicEndpoint(path string) bool {
	for _, endpoint := range ja.publicEndpoints {
		if path == endpoint {
			return true
		}
	}
	return false
}

func (ja *JWTAuth) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		if !strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Next()
			return
		}

		// Check if this is a public endpoint
		if ja.isPublicEndpoint(c.Request.URL.Path) {
			// No token is required here, but a caller who sends a valid one is
			// still identified: e.g. passkey registration lets a signed-in user
			// add a passkey to their own account. A missing or invalid token
			// is ignored, exactly as before.
			// Tokens never identify the caller here: passkey registration
			// would otherwise let a token holder add a passkey to the account.
			if ja.config.AuthEnabled {
				ja.authenticate(c, false)
			}
			c.Next()
			return
		}

		if !ja.config.AuthEnabled {
			c.Next()
			return
		}

		// Allow public access to shared documents
		if strings.HasPrefix(c.Request.URL.Path, "/api/shares/") && c.Request.Method == "GET" {
			pathParts := strings.Split(strings.TrimPrefix(c.Request.URL.Path, "/api/shares/"), "/")
			if len(pathParts) == 1 && pathParts[0] != "" {
				c.Next()
				return
			}
		}

		if !ja.authenticate(c, true) {
			ja.unauthorized(c)
			return
		}

		if c.GetString(AuthMethodKey) == AuthMethodToken {
			if !tokenAllowed(c.Request.URL.Path) {
				ja.forbidden(c, "Personal access tokens can't use this endpoint")
				return
			}
			// A read-only token can only read the REST API.
			if c.GetString(TokenScopeKey) == services.TokenScopeRead && !isReadMethod(c.Request.Method) &&
				c.Request.URL.Path != MCPPath {
				ja.forbidden(c, "This token is read-only")
				return
			}
		}

		c.Next()
	}
}

// authenticate validates the request's bearer credential (a session JWT, or a
// personal access token when allowTokens) and records who made the request.
func (ja *JWTAuth) authenticate(c *gin.Context, allowTokens bool) bool {
	credential := ja.extractToken(c.GetHeader("Authorization"))
	if credential == "" {
		return false
	}

	if services.IsAPIToken(credential) {
		if !allowTokens || ja.tokenService == nil {
			return false
		}
		token, err := ja.tokenService.Validate(credential)
		if err != nil {
			return false
		}
		c.Set("authenticated_user", token.Username)
		c.Set(AuthMethodKey, AuthMethodToken)
		c.Set(TokenScopeKey, token.Scope)
		return true
	}

	username, err := ja.authService.ValidateToken(credential)
	if err != nil {
		return false
	}
	c.Set("authenticated_user", username)
	c.Set(AuthMethodKey, AuthMethodSession)
	return true
}

// tokenPrefixes are the parts of the API a personal access token may use:
// documents and what's derived from them. Secrets, passkeys, users, tokens,
// shares and GitHub settings need a signed-in session, so a leaked token can't
// read secret values or take over the account.
var tokenPrefixes = []string{
	MCPPath,
	"/api/documents", "/api/folders", "/api/assets", "/api/links", "/api/versions",
	"/api/export", "/api/import/documents", "/api/search", "/api/tags", "/api/templates",
}

func tokenAllowed(path string) bool {
	for _, prefix := range tokenPrefixes {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	return false
}

func isReadMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead
}

func (ja *JWTAuth) extractToken(auth string) string {
	const prefix = "Bearer "
	if strings.HasPrefix(auth, prefix) {
		return auth[len(prefix):]
	}
	return ""
}

func (ja *JWTAuth) forbidden(c *gin.Context, message string) {
	c.JSON(http.StatusForbidden, gin.H{
		"error":   "Forbidden",
		"message": message,
	})
	c.Abort()
}

func (ja *JWTAuth) unauthorized(c *gin.Context) {
	c.JSON(http.StatusUnauthorized, gin.H{
		"error":   "Unauthorized",
		"message": "Authentication required to access this resource",
	})
	c.Abort()
}

func JWTMiddleware(authService *services.AuthService, tokenService *services.TokenService, config *config.Config) gin.HandlerFunc {
	auth := NewJWTAuth(authService, tokenService, config)
	return auth.Middleware()
}

package middleware

import (
	"net/http"
	"strings"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-gonic/gin"
)

type JWTAuth struct {
	authService     *services.AuthService
	config          *config.Config
	publicEndpoints []string
}

func NewJWTAuth(authService *services.AuthService, config *config.Config) *JWTAuth {
	return &JWTAuth{
		authService: authService,
		config:      config,
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
			if ja.config.AuthEnabled {
				if username, ok := ja.authenticate(c); ok {
					c.Set("authenticated_user", username)
				}
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

		username, ok := ja.authenticate(c)
		if !ok {
			ja.unauthorized(c)
			return
		}

		c.Set("authenticated_user", username)
		c.Next()
	}
}

// authenticate validates the request's bearer token and returns its username.
func (ja *JWTAuth) authenticate(c *gin.Context) (string, bool) {
	token := ja.extractToken(c.GetHeader("Authorization"))
	if token == "" {
		return "", false
	}

	username, err := ja.authService.ValidateToken(token)
	if err != nil {
		return "", false
	}
	return username, true
}

func (ja *JWTAuth) extractToken(auth string) string {
	const prefix = "Bearer "
	if strings.HasPrefix(auth, prefix) {
		return auth[len(prefix):]
	}
	return ""
}

func (ja *JWTAuth) unauthorized(c *gin.Context) {
	c.JSON(http.StatusUnauthorized, gin.H{
		"error":   "Unauthorized",
		"message": "Authentication required to access this resource",
	})
	c.Abort()
}

func JWTMiddleware(authService *services.AuthService, config *config.Config) gin.HandlerFunc {
	auth := NewJWTAuth(authService, config)
	return auth.Middleware()
}

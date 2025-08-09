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

		auth := c.GetHeader("Authorization")
		if auth == "" {
			ja.unauthorized(c)
			return
		}

		token := ja.extractToken(auth)
		if token == "" {
			ja.unauthorized(c)
			return
		}

		username, err := ja.authService.ValidateToken(token)
		if err != nil {
			ja.unauthorized(c)
			return
		}

		c.Set("authenticated_user", username)
		c.Next()
	}
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

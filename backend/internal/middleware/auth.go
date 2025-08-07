package middleware

import (
	"net/http"
	"strings"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-gonic/gin"
)

type JWTAuth struct {
	authService *services.AuthService
	config      *config.Config
}

func NewJWTAuth(authService *services.AuthService, config *config.Config) *JWTAuth {
	return &JWTAuth{
		authService: authService,
		config:      config,
	}
}

func (ja *JWTAuth) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Always allow OPTIONS requests for CORS preflight
		if c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		if c.Request.URL.Path == "/api/health" || c.Request.URL.Path == "/api/config" {
			c.Next()
			return
		}

		if !ja.config.AuthEnabled {
			c.Next()
			return
		}

		// Only allow login and logout endpoints to bypass authentication
		if c.Request.URL.Path == "/api/auth/login" || c.Request.URL.Path == "/api/auth/logout" {
			c.Next()
			return
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

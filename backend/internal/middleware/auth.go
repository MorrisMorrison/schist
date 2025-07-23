package middleware

import (
	"encoding/base64"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// BasicAuth represents a basic authentication middleware
type BasicAuth struct {
	users map[string]string // username -> bcrypt hash
	realm string
}

// NewBasicAuth creates a new basic auth middleware
func NewBasicAuth(users map[string]string, realm string) *BasicAuth {
	return &BasicAuth{
		users: users,
		realm: realm,
	}
}

// Middleware returns the Gin middleware function
func (ba *BasicAuth) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip authentication for health endpoint
		if c.Request.URL.Path == "/api/health" {
			c.Next()
			return
		}

		// Get authorization header
		auth := c.GetHeader("Authorization")
		if auth == "" {
			ba.unauthorized(c)
			return
		}

		// Parse basic auth header
		username, password, ok := ba.parseBasicAuth(auth)
		if !ok {
			ba.unauthorized(c)
			return
		}

		// Verify credentials
		if !ba.verifyCredentials(username, password) {
			ba.unauthorized(c)
			return
		}

		// Set authenticated user in context
		c.Set("authenticated_user", username)
		c.Next()
	}
}

// parseBasicAuth parses the Authorization header for basic auth
func (ba *BasicAuth) parseBasicAuth(auth string) (username, password string, ok bool) {
	const prefix = "Basic "
	if !strings.HasPrefix(auth, prefix) {
		return "", "", false
	}

	encoded := auth[len(prefix):]
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", "", false
	}

	credentials := string(decoded)
	parts := strings.SplitN(credentials, ":", 2)
	if len(parts) != 2 {
		return "", "", false
	}

	return parts[0], parts[1], true
}

// verifyCredentials checks if the provided credentials are valid
func (ba *BasicAuth) verifyCredentials(username, password string) bool {
	hash, exists := ba.users[username]
	if !exists {
		// Use a dummy hash to prevent timing attacks
		bcrypt.CompareHashAndPassword([]byte("$2a$10$dummy"), []byte(password))
		return false
	}

	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// unauthorized sends an unauthorized response
func (ba *BasicAuth) unauthorized(c *gin.Context) {
	c.Header("WWW-Authenticate", `Basic realm="`+ba.realm+`"`)
	c.JSON(http.StatusUnauthorized, gin.H{
		"error":   "Unauthorized",
		"message": "Authentication required to access this resource",
	})
	c.Abort()
}

// HashPassword generates a bcrypt hash for a password
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

// BasicAuthMiddleware creates a basic auth middleware from config
func BasicAuthMiddleware(users map[string]string, realm string) gin.HandlerFunc {
	if len(users) == 0 {
		// Return a no-op middleware if no users are configured
		return func(c *gin.Context) {
			c.Next()
		}
	}

	auth := NewBasicAuth(users, realm)
	return auth.Middleware()
}

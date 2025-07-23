package middleware

import (
	"encoding/base64"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type BasicAuth struct {
	users map[string]string // username:bcrypt hash
	realm string
}

func NewBasicAuth(users map[string]string, realm string) *BasicAuth {
	return &BasicAuth{
		users: users,
		realm: realm,
	}
}

func (ba *BasicAuth) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.URL.Path == "/api/health" {
			c.Next()
			return
		}

		auth := c.GetHeader("Authorization")
		if auth == "" {
			ba.unauthorized(c)
			return
		}

		username, password, ok := ba.parseBasicAuth(auth)
		if !ok {
			ba.unauthorized(c)
			return
		}

		if !ba.verifyCredentials(username, password) {
			ba.unauthorized(c)
			return
		}

		c.Set("authenticated_user", username)
		c.Next()
	}
}

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

func (ba *BasicAuth) verifyCredentials(username, password string) bool {
	hash, exists := ba.users[username]
	if !exists {
		return false
	}

	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func (ba *BasicAuth) unauthorized(c *gin.Context) {
	c.Header("WWW-Authenticate", `Basic realm="`+ba.realm+`"`)
	c.JSON(http.StatusUnauthorized, gin.H{
		"error":   "Unauthorized",
		"message": "Authentication required to access this resource",
	})
	c.Abort()
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func BasicAuthMiddleware(users map[string]string, realm string) gin.HandlerFunc {
	if len(users) == 0 {
		return func(c *gin.Context) {
			c.Next()
		}
	}

	auth := NewBasicAuth(users, realm)
	return auth.Middleware()
}

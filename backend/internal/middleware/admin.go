package middleware

import (
	"net/http"

	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-gonic/gin"
)

// RequireAdmin returns middleware that allows the request to proceed only if it
// is made by an authenticated user whose IsAdmin flag is true. It relies on the
// JWT auth middleware having already run and stored the authenticated username
// under the "authenticated_user" context key.
//
// This closes the gap on the user-management endpoints (/auth/users*,
// /auth/invite), which previously enforced no authorization at all.
func RequireAdmin(userService *services.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		v, ok := c.Get("authenticated_user")
		if !ok {
			forbidden(c, "Authentication required to access this resource")
			return
		}

		username, ok := v.(string)
		if !ok || username == "" {
			forbidden(c, "Authentication required to access this resource")
			return
		}

		user, err := userService.GetUserByUsername(username)
		if err != nil || !user.IsAdmin {
			forbidden(c, "Administrator privileges required to access this resource")
			return
		}

		c.Next()
	}
}

func forbidden(c *gin.Context, message string) {
	c.JSON(http.StatusForbidden, gin.H{
		"error":   "Forbidden",
		"message": message,
	})
	c.Abort()
}

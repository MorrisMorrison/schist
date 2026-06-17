package handlers

import "github.com/gin-gonic/gin"

// currentUser returns the authenticated username set by the auth middleware,
// and whether one is present. Centralizes the repeated
// c.Get("authenticated_user") + type-assertion dance.
func currentUser(c *gin.Context) (string, bool) {
	v, ok := c.Get("authenticated_user")
	if !ok {
		return "", false
	}
	username, ok := v.(string)
	return username, ok
}

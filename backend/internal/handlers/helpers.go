package handlers

import (
	"fmt"
	"net/http"

	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/utils"
	"github.com/gin-gonic/gin"
)

// apiTimeFormat is how timestamps in hand-built response DTOs are formatted.
const apiTimeFormat = "2006-01-02T15:04:05Z"

// The helpers below that return a bool write the error response themselves
// (through HandleError); a handler just returns when they report false.

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

// requireUser returns the authenticated username, or responds 401 when the
// request has none.
func requireUser(c *gin.Context) (string, bool) {
	username, ok := currentUser(c)
	if !ok {
		HandleError(c, errors.NewUnauthorizedError("Authentication required"))
	}
	return username, ok
}

// bindJSON decodes the JSON request body into obj, or responds 400.
func bindJSON(c *gin.Context, obj any) bool {
	if apiErr := ValidateJSONBody(c, obj); apiErr != nil {
		HandleError(c, apiErr)
		return false
	}
	return true
}

// requiredParam returns a route parameter, or responds 400 when it is empty.
func requiredParam(c *gin.Context, name string) (string, bool) {
	value, apiErr := ValidatePathParameter(c, name)
	if apiErr != nil {
		HandleError(c, apiErr)
		return "", false
	}
	return value, true
}

// requiredQuery returns a query parameter, or responds 400 when it is empty.
func requiredQuery(c *gin.Context, name string) (string, bool) {
	value, apiErr := ValidateQueryParameter(c, name, true)
	if apiErr != nil {
		HandleError(c, apiErr)
		return "", false
	}
	return value, true
}

// pathParam returns the catch-all ":path" route parameter, normalized with a
// leading slash.
func pathParam(c *gin.Context) string {
	return utils.EnsureLeadingSlash(c.Param("path"))
}

// sendAttachment responds with content as a file download.
func sendAttachment(c *gin.Context, filename, contentType string, content []byte) {
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", contentType)
	c.Header("Content-Length", fmt.Sprintf("%d", len(content)))
	c.Data(http.StatusOK, contentType, content)
}

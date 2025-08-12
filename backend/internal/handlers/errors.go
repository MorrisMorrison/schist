package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/MorrisMorrison/schist/internal/errors"
)

// ErrorResponse represents the JSON structure for error responses
type ErrorResponse struct {
	Error   string                 `json:"error"`
	Code    string                 `json:"code,omitempty"`
	Details map[string]any `json:"details,omitempty"`
}

// HandleError processes and responds to errors in a consistent manner
func HandleError(c *gin.Context, err error) {
	if err == nil {
		return
	}

	var apiErr *errors.APIError
	if errors.IsAPIError(err) {
		apiErr = err.(*errors.APIError)
	} else {
		// Wrap unknown errors as internal errors
		apiErr = errors.WrapError(err)
	}

	// Log the error with context
	logError(c, apiErr)

	// Create response
	response := ErrorResponse{
		Error: apiErr.Message,
		Code:  string(apiErr.Code),
	}

	// Include details if present and not an internal error (for security)
	if apiErr.HTTPStatus != http.StatusInternalServerError && len(apiErr.Details) > 0 {
		response.Details = apiErr.Details
	}

	c.JSON(apiErr.HTTPStatus, response)
}

// logError logs the error with appropriate context
func logError(c *gin.Context, apiErr *errors.APIError) {
	// Build context information
	context := map[string]any{
		"method":     c.Request.Method,
		"path":       c.Request.URL.Path,
		"user_agent": c.Request.UserAgent(),
		"remote_ip":  c.ClientIP(),
		"error_code": apiErr.Code,
	}

	// Add query parameters if present
	if len(c.Request.URL.RawQuery) > 0 {
		context["query"] = c.Request.URL.RawQuery
	}

	// Add request ID if present
	if requestID := c.GetString("request_id"); requestID != "" {
		context["request_id"] = requestID
	}

	// Convert context to JSON for structured logging
	contextJSON, _ := json.Marshal(context)

	// Log based on error severity
	switch apiErr.HTTPStatus {
	case http.StatusInternalServerError, http.StatusServiceUnavailable:
		if apiErr.Cause != nil {
			log.Printf("ERROR: %s | Context: %s | Cause: %v", apiErr.Error(), string(contextJSON), apiErr.Cause)
		} else {
			log.Printf("ERROR: %s | Context: %s", apiErr.Error(), string(contextJSON))
		}
	case http.StatusBadRequest, http.StatusNotFound, http.StatusConflict:
		log.Printf("WARN: %s | Context: %s", apiErr.Error(), string(contextJSON))
	default:
		log.Printf("INFO: %s | Context: %s", apiErr.Error(), string(contextJSON))
	}
}

// ValidationMiddleware creates middleware for request validation
func ValidationMiddleware() gin.HandlerFunc {
	return gin.HandlerFunc(func(c *gin.Context) {
		// Add request ID for tracing
		if requestID := c.GetHeader("X-Request-ID"); requestID != "" {
			c.Set("request_id", requestID)
		}

		c.Next()

		// Handle any errors that occurred during request processing
		if len(c.Errors) > 0 {
			// Get the last error
			err := c.Errors.Last().Err
			HandleError(c, err)
			c.Abort()
		}
	})
}

// RecoverMiddleware handles panics and converts them to internal server errors
func RecoverMiddleware() gin.HandlerFunc {
	return gin.HandlerFunc(func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				// Log the panic
				log.Printf("PANIC: %v | Path: %s %s", err, c.Request.Method, c.Request.URL.Path)
				
				// Return internal server error
				internalErr := errors.NewInternalError("Internal server error")
				HandleError(c, internalErr)
				c.Abort()
			}
		}()
		c.Next()
	})
}

// Helper functions for common error patterns

// ValidatePathParameter validates a path parameter and returns appropriate error
func ValidatePathParameter(c *gin.Context, paramName string) (string, *errors.APIError) {
	path := c.Param(paramName)
	if path == "" {
		return "", errors.NewMissingRequiredFieldError(paramName)
	}
	return path, nil
}

// ValidateQueryParameter validates a query parameter
func ValidateQueryParameter(c *gin.Context, paramName string, required bool) (string, *errors.APIError) {
	value := c.Query(paramName)
	if required && value == "" {
		return "", errors.NewMissingRequiredFieldError(paramName)
	}
	return value, nil
}

// ValidateJSONBody validates and binds JSON request body
func ValidateJSONBody(c *gin.Context, obj interface{}) *errors.APIError {
	if err := c.ShouldBindJSON(obj); err != nil {
		return errors.NewInvalidRequestError("Invalid JSON in request body").WithCause(err)
	}
	return nil
}

// Success response helpers

// RespondWithSuccess sends a successful response with data
func RespondWithSuccess(c *gin.Context, statusCode int, data interface{}) {
	c.JSON(statusCode, data)
}

// RespondWithCreated sends a 201 Created response
func RespondWithCreated(c *gin.Context, data interface{}) {
	RespondWithSuccess(c, http.StatusCreated, data)
}

// RespondWithOK sends a 200 OK response
func RespondWithOK(c *gin.Context, data interface{}) {
	RespondWithSuccess(c, http.StatusOK, data)
}

// RespondWithNoContent sends a 204 No Content response
func RespondWithNoContent(c *gin.Context) {
	c.JSON(http.StatusNoContent, nil)
}
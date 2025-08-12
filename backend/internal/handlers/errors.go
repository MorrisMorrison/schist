package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/gin-gonic/gin"
)

type ErrorResponse struct {
	Error   string         `json:"error"`
	Code    string         `json:"code,omitempty"`
	Details map[string]any `json:"details,omitempty"`
}

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

	logError(c, apiErr)

	response := ErrorResponse{
		Error: apiErr.Message,
		Code:  string(apiErr.Code),
	}

	if apiErr.HTTPStatus != http.StatusInternalServerError && len(apiErr.Details) > 0 {
		response.Details = apiErr.Details
	}

	c.JSON(apiErr.HTTPStatus, response)
}

func logError(c *gin.Context, apiErr *errors.APIError) {
	context := map[string]any{
		"method":     c.Request.Method,
		"path":       c.Request.URL.Path,
		"user_agent": c.Request.UserAgent(),
		"remote_ip":  c.ClientIP(),
		"error_code": apiErr.Code,
	}

	if len(c.Request.URL.RawQuery) > 0 {
		context["query"] = c.Request.URL.RawQuery
	}

	if requestID := c.GetString("request_id"); requestID != "" {
		context["request_id"] = requestID
	}

	contextJSON, _ := json.Marshal(context)

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

func ValidationMiddleware() gin.HandlerFunc {
	return gin.HandlerFunc(func(c *gin.Context) {
		if requestID := c.GetHeader("X-Request-ID"); requestID != "" {
			c.Set("request_id", requestID)
		}

		c.Next()

		if len(c.Errors) > 0 {
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
				log.Printf("PANIC: %v | Path: %s %s", err, c.Request.Method, c.Request.URL.Path)

				internalErr := errors.NewInternalError("Internal server error")
				HandleError(c, internalErr)
				c.Abort()
			}
		}()
		c.Next()
	})
}

// Helper functions for common error patterns

func ValidatePathParameter(c *gin.Context, paramName string) (string, *errors.APIError) {
	path := c.Param(paramName)
	if path == "" {
		return "", errors.NewMissingRequiredFieldError(paramName)
	}
	return path, nil
}

func ValidateQueryParameter(c *gin.Context, paramName string, required bool) (string, *errors.APIError) {
	value := c.Query(paramName)
	if required && value == "" {
		return "", errors.NewMissingRequiredFieldError(paramName)
	}
	return value, nil
}

func ValidateJSONBody(c *gin.Context, obj interface{}) *errors.APIError {
	if err := c.ShouldBindJSON(obj); err != nil {
		return errors.NewInvalidRequestError("Invalid JSON in request body").WithCause(err)
	}
	return nil
}

// Success response helpers

func RespondWithSuccess(c *gin.Context, statusCode int, data interface{}) {
	c.JSON(statusCode, data)
}

func RespondWithCreated(c *gin.Context, data interface{}) {
	RespondWithSuccess(c, http.StatusCreated, data)
}

func RespondWithOK(c *gin.Context, data interface{}) {
	RespondWithSuccess(c, http.StatusOK, data)
}

func RespondWithNoContent(c *gin.Context) {
	c.JSON(http.StatusNoContent, nil)
}

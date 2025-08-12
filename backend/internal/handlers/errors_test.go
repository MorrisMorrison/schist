package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/gin-gonic/gin"
)

func TestHandleError(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		error          error
		expectedStatus int
		expectedCode   string
	}{
		{
			name:           "APIError",
			error:          errors.NewValidationError("Invalid input"),
			expectedStatus: http.StatusBadRequest,
			expectedCode:   "VALIDATION_ERROR",
		},
		{
			name:           "Generic error wrapped",
			error:          fmt.Errorf("generic error"),
			expectedStatus: http.StatusInternalServerError,
			expectedCode:   "INTERNAL_ERROR",
		},
		{
			name:           "Not found error",
			error:          errors.NewNotFoundError("document", "/test"),
			expectedStatus: http.StatusNotFound,
			expectedCode:   "RESOURCE_NOT_FOUND",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("GET", "/test", nil)

			HandleError(c, tt.error)

			if w.Code != tt.expectedStatus {
				t.Errorf("HandleError() status = %v, want %v", w.Code, tt.expectedStatus)
			}

			var response ErrorResponse
			if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
				t.Fatalf("Failed to unmarshal response: %v", err)
			}

			if response.Code != tt.expectedCode {
				t.Errorf("HandleError() code = %v, want %v", response.Code, tt.expectedCode)
			}
		})
	}
}

func TestValidatePathParameter(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name       string
		paramName  string
		paramValue string
		wantError  bool
		wantValue  string
	}{
		{
			name:       "valid path parameter",
			paramName:  "path",
			paramValue: "/test/path",
			wantError:  false,
			wantValue:  "/test/path",
		},
		{
			name:       "missing path parameter",
			paramName:  "path",
			paramValue: "",
			wantError:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Params = gin.Params{{Key: tt.paramName, Value: tt.paramValue}}

			value, apiErr := ValidatePathParameter(c, tt.paramName)

			if tt.wantError {
				if apiErr == nil {
					t.Error("ValidatePathParameter() expected error but got none")
				}
			} else {
				if apiErr != nil {
					t.Errorf("ValidatePathParameter() unexpected error: %v", apiErr)
				}
				if value != tt.wantValue {
					t.Errorf("ValidatePathParameter() value = %v, want %v", value, tt.wantValue)
				}
			}
		})
	}
}

func TestValidateQueryParameter(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name       string
		paramName  string
		paramValue string
		required   bool
		wantError  bool
		wantValue  string
	}{
		{
			name:       "valid required query parameter",
			paramName:  "filter",
			paramValue: "active",
			required:   true,
			wantError:  false,
			wantValue:  "active",
		},
		{
			name:       "missing required query parameter",
			paramName:  "filter",
			paramValue: "",
			required:   true,
			wantError:  true,
		},
		{
			name:       "missing optional query parameter",
			paramName:  "filter",
			paramValue: "",
			required:   false,
			wantError:  false,
			wantValue:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			if tt.paramValue != "" {
				c.Request = httptest.NewRequest("GET", fmt.Sprintf("/test?%s=%s", tt.paramName, tt.paramValue), nil)
			} else {
				c.Request = httptest.NewRequest("GET", "/test", nil)
			}

			value, apiErr := ValidateQueryParameter(c, tt.paramName, tt.required)

			if tt.wantError {
				if apiErr == nil {
					t.Error("ValidateQueryParameter() expected error but got none")
				}
			} else {
				if apiErr != nil {
					t.Errorf("ValidateQueryParameter() unexpected error: %v", apiErr)
				}
				if value != tt.wantValue {
					t.Errorf("ValidateQueryParameter() value = %v, want %v", value, tt.wantValue)
				}
			}
		})
	}
}

func TestValidateJSONBody(t *testing.T) {
	gin.SetMode(gin.TestMode)

	type TestStruct struct {
		Name  string `json:"name" binding:"required"`
		Email string `json:"email" binding:"required,email"`
	}

	tests := []struct {
		name      string
		body      string
		wantError bool
	}{
		{
			name:      "valid JSON",
			body:      `{"name": "John", "email": "john@example.com"}`,
			wantError: false,
		},
		{
			name:      "invalid JSON",
			body:      `{"name": "John", "email":}`,
			wantError: true,
		},
		{
			name:      "missing required field",
			body:      `{"name": "John"}`,
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("POST", "/test", bytes.NewBufferString(tt.body))
			c.Request.Header.Set("Content-Type", "application/json")

			var obj TestStruct
			apiErr := ValidateJSONBody(c, &obj)

			if tt.wantError {
				if apiErr == nil {
					t.Error("ValidateJSONBody() expected error but got none")
				}
			} else {
				if apiErr != nil {
					t.Errorf("ValidateJSONBody() unexpected error: %v", apiErr)
				}
			}
		})
	}
}

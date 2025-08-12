package errors

import (
	"fmt"
	"net/http"
	"testing"
)

func TestAPIError_Error(t *testing.T) {
	tests := []struct {
		name     string
		apiError *APIError
		expected string
	}{
		{
			name: "error without cause",
			apiError: &APIError{
				Code:    ErrCodeValidation,
				Message: "Invalid input",
			},
			expected: "VALIDATION_ERROR: Invalid input",
		},
		{
			name: "error with cause",
			apiError: &APIError{
				Code:    ErrCodeDatabase,
				Message: "Database connection failed",
				Cause:   fmt.Errorf("connection timeout"),
			},
			expected: "DATABASE_ERROR: Database connection failed (caused by: connection timeout)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.apiError.Error()
			if result != tt.expected {
				t.Errorf("APIError.Error() = %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestAPIError_Unwrap(t *testing.T) {
	cause := fmt.Errorf("underlying error")
	apiError := &APIError{
		Code:    ErrCodeInternal,
		Message: "Internal error",
		Cause:   cause,
	}

	if apiError.Unwrap() != cause {
		t.Errorf("APIError.Unwrap() = %v, want %v", apiError.Unwrap(), cause)
	}
}

func TestNewAPIError(t *testing.T) {
	code := ErrCodeNotFound
	message := "Resource not found"
	httpStatus := http.StatusNotFound

	apiError := NewAPIError(code, message, httpStatus)

	if apiError.Code != code {
		t.Errorf("NewAPIError().Code = %v, want %v", apiError.Code, code)
	}
	if apiError.Message != message {
		t.Errorf("NewAPIError().Message = %v, want %v", apiError.Message, message)
	}
	if apiError.HTTPStatus != httpStatus {
		t.Errorf("NewAPIError().HTTPStatus = %v, want %v", apiError.HTTPStatus, httpStatus)
	}
	if apiError.Details == nil {
		t.Error("NewAPIError().Details should be initialized")
	}
}

func TestAPIError_WithDetails(t *testing.T) {
	apiError := NewAPIError(ErrCodeValidation, "Invalid field", http.StatusBadRequest)
	apiError.WithDetails("field", "email")
	apiError.WithDetails("value", "invalid-email")

	if apiError.Details["field"] != "email" {
		t.Errorf("WithDetails() field = %v, want %v", apiError.Details["field"], "email")
	}
	if apiError.Details["value"] != "invalid-email" {
		t.Errorf("WithDetails() value = %v, want %v", apiError.Details["value"], "invalid-email")
	}
}

func TestAPIError_WithCause(t *testing.T) {
	cause := fmt.Errorf("underlying error")
	apiError := NewAPIError(ErrCodeDatabase, "Database error", http.StatusInternalServerError)
	apiError.WithCause(cause)

	if apiError.Cause != cause {
		t.Errorf("WithCause() = %v, want %v", apiError.Cause, cause)
	}
}

func TestValidationErrors(t *testing.T) {
	tests := []struct {
		name       string
		errorFunc  func() *APIError
		wantCode   ErrorCode
		wantStatus int
	}{
		{
			name:       "NewValidationError",
			errorFunc:  func() *APIError { return NewValidationError("Invalid input") },
			wantCode:   ErrCodeValidation,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "NewInvalidPathError",
			errorFunc:  func() *APIError { return NewInvalidPathError("/invalid/path") },
			wantCode:   ErrCodeInvalidPath,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "NewMissingRequiredFieldError",
			errorFunc:  func() *APIError { return NewMissingRequiredFieldError("email") },
			wantCode:   ErrCodeMissingRequired,
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.errorFunc()
			if err.Code != tt.wantCode {
				t.Errorf("%s Code = %v, want %v", tt.name, err.Code, tt.wantCode)
			}
			if err.HTTPStatus != tt.wantStatus {
				t.Errorf("%s HTTPStatus = %v, want %v", tt.name, err.HTTPStatus, tt.wantStatus)
			}
		})
	}
}

func TestResourceErrors(t *testing.T) {
	tests := []struct {
		name       string
		errorFunc  func() *APIError
		wantCode   ErrorCode
		wantStatus int
	}{
		{
			name:       "NewNotFoundError",
			errorFunc:  func() *APIError { return NewNotFoundError("document", "/path") },
			wantCode:   ErrCodeNotFound,
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "NewAlreadyExistsError",
			errorFunc:  func() *APIError { return NewAlreadyExistsError("document", "/path") },
			wantCode:   ErrCodeAlreadyExists,
			wantStatus: http.StatusConflict,
		},
		{
			name:       "NewConflictError",
			errorFunc:  func() *APIError { return NewConflictError("Resource conflict") },
			wantCode:   ErrCodeConflict,
			wantStatus: http.StatusConflict,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.errorFunc()
			if err.Code != tt.wantCode {
				t.Errorf("%s Code = %v, want %v", tt.name, err.Code, tt.wantCode)
			}
			if err.HTTPStatus != tt.wantStatus {
				t.Errorf("%s HTTPStatus = %v, want %v", tt.name, err.HTTPStatus, tt.wantStatus)
			}
		})
	}
}

func TestSystemErrors(t *testing.T) {
	tests := []struct {
		name       string
		errorFunc  func() *APIError
		wantCode   ErrorCode
		wantStatus int
	}{
		{
			name:       "NewInternalError",
			errorFunc:  func() *APIError { return NewInternalError("Internal error") },
			wantCode:   ErrCodeInternal,
			wantStatus: http.StatusInternalServerError,
		},
		{
			name:       "NewDatabaseError",
			errorFunc:  func() *APIError { return NewDatabaseError("query", fmt.Errorf("connection failed")) },
			wantCode:   ErrCodeDatabase,
			wantStatus: http.StatusInternalServerError,
		},
		{
			name:       "NewTimeoutError",
			errorFunc:  func() *APIError { return NewTimeoutError("database query") },
			wantCode:   ErrCodeTimeout,
			wantStatus: http.StatusRequestTimeout,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.errorFunc()
			if err.Code != tt.wantCode {
				t.Errorf("%s Code = %v, want %v", tt.name, err.Code, tt.wantCode)
			}
			if err.HTTPStatus != tt.wantStatus {
				t.Errorf("%s HTTPStatus = %v, want %v", tt.name, err.HTTPStatus, tt.wantStatus)
			}
		})
	}
}

func TestWrapError(t *testing.T) {
	tests := []struct {
		name     string
		input    error
		wantCode ErrorCode
	}{
		{
			name:     "wrap APIError",
			input:    NewValidationError("Invalid input"),
			wantCode: ErrCodeValidation,
		},
		{
			name:     "wrap generic error",
			input:    fmt.Errorf("generic error"),
			wantCode: ErrCodeInternal,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wrapped := WrapError(tt.input)
			if wrapped.Code != tt.wantCode {
				t.Errorf("WrapError().Code = %v, want %v", wrapped.Code, tt.wantCode)
			}
		})
	}
}

func TestIsAPIError(t *testing.T) {
	tests := []struct {
		name  string
		input error
		want  bool
	}{
		{
			name:  "APIError",
			input: NewValidationError("Invalid input"),
			want:  true,
		},
		{
			name:  "generic error",
			input: fmt.Errorf("generic error"),
			want:  false,
		},
		{
			name:  "nil error",
			input: nil,
			want:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsAPIError(tt.input)
			if result != tt.want {
				t.Errorf("IsAPIError() = %v, want %v", result, tt.want)
			}
		})
	}
}
package errors

import (
	stderrors "errors"
	"fmt"
	"net/http"
)

type ErrorCode string

const (
	// Validation errors
	ErrCodeValidation      ErrorCode = "VALIDATION_ERROR"
	ErrCodeInvalidPath     ErrorCode = "INVALID_PATH"
	ErrCodeInvalidRequest  ErrorCode = "INVALID_REQUEST"
	ErrCodeMissingRequired ErrorCode = "MISSING_REQUIRED_FIELD"

	// Resource errors
	ErrCodeNotFound      ErrorCode = "RESOURCE_NOT_FOUND"
	ErrCodeAlreadyExists ErrorCode = "RESOURCE_ALREADY_EXISTS"
	ErrCodeConflict      ErrorCode = "RESOURCE_CONFLICT"

	// Authorization errors
	ErrCodeUnauthorized ErrorCode = "UNAUTHORIZED"
	ErrCodeForbidden    ErrorCode = "FORBIDDEN"

	// System errors
	ErrCodeInternal    ErrorCode = "INTERNAL_ERROR"
	ErrCodeDatabase    ErrorCode = "DATABASE_ERROR"
	ErrCodeFileSystem  ErrorCode = "FILESYSTEM_ERROR"
	ErrCodeNetwork     ErrorCode = "NETWORK_ERROR"
	ErrCodeTimeout     ErrorCode = "TIMEOUT_ERROR"
	ErrCodeRateLimited ErrorCode = "RATE_LIMITED"
	ErrCodeUnavailable ErrorCode = "SERVICE_UNAVAILABLE"

	// Business logic errors
	ErrCodeOperationFailed ErrorCode = "OPERATION_FAILED"
	ErrCodeInvalidState    ErrorCode = "INVALID_STATE"

	// ErrCodeSecretsLocked: the request needs the unlocked secret store. The
	// unlocked state lives in server memory, so a restart locks it again; the
	// client should refresh its status and ask the user to unlock.
	ErrCodeSecretsLocked ErrorCode = "SECRETS_LOCKED"
	// ErrCodeSyncRemoteDiverged: the GitHub branch has commits the wiki's
	// history doesn't contain, so a normal push would lose them.
	ErrCodeSyncRemoteDiverged ErrorCode = "SYNC_REMOTE_DIVERGED"

	// ErrCodeDocumentChanged: a save carried a baseVersion that no longer
	// matches the page (it changed through a sync or another user).
	ErrCodeDocumentChanged ErrorCode = "DOCUMENT_CHANGED"
)

type APIError struct {
	Code       ErrorCode      `json:"code"`
	Message    string         `json:"message"`
	Details    map[string]any `json:"details,omitempty"`
	HTTPStatus int            `json:"-"`
	Cause      error          `json:"-"`
}

func (e *APIError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s (caused by: %v)", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *APIError) Unwrap() error {
	return e.Cause
}

func NewAPIError(code ErrorCode, message string, httpStatus int) *APIError {
	return &APIError{
		Code:       code,
		Message:    message,
		HTTPStatus: httpStatus,
		Details:    make(map[string]any),
	}
}

func (e *APIError) WithDetails(key string, value any) *APIError {
	if e.Details == nil {
		e.Details = make(map[string]any)
	}
	e.Details[key] = value
	return e
}

func (e *APIError) WithCause(cause error) *APIError {
	e.Cause = cause
	return e
}

// Validation Errors
func NewValidationError(message string) *APIError {
	return NewAPIError(ErrCodeValidation, message, http.StatusBadRequest)
}

func NewInvalidPathError(path string) *APIError {
	return NewAPIError(ErrCodeInvalidPath, fmt.Sprintf("Invalid path: %s", path), http.StatusBadRequest).
		WithDetails("path", path)
}

func NewInvalidRequestError(message string) *APIError {
	return NewAPIError(ErrCodeInvalidRequest, message, http.StatusBadRequest)
}

func NewMissingRequiredFieldError(field string) *APIError {
	return NewAPIError(ErrCodeMissingRequired, fmt.Sprintf("Missing required field: %s", field), http.StatusBadRequest).
		WithDetails("field", field)
}

// Resource Errors
func NewNotFoundError(resource, identifier string) *APIError {
	return NewAPIError(ErrCodeNotFound, fmt.Sprintf("%s not found: %s", resource, identifier), http.StatusNotFound).
		WithDetails("resource", resource).
		WithDetails("identifier", identifier)
}

func NewAlreadyExistsError(resource, identifier string) *APIError {
	message := fmt.Sprintf("%s already exists: %s", resource, identifier)
	return NewAPIError(ErrCodeAlreadyExists, message, http.StatusConflict).
		WithDetails("resource", resource).
		WithDetails("identifier", identifier)
}

func NewConflictError(message string) *APIError {
	return NewAPIError(ErrCodeConflict, message, http.StatusConflict)
}

// Authorization Errors
func NewUnauthorizedError(message string) *APIError {
	if message == "" {
		message = "Authentication required"
	}
	return NewAPIError(ErrCodeUnauthorized, message, http.StatusUnauthorized)
}

func NewForbiddenError(message string) *APIError {
	if message == "" {
		message = "Access forbidden"
	}
	return NewAPIError(ErrCodeForbidden, message, http.StatusForbidden)
}

// System Errors
func NewInternalError(message string) *APIError {
	if message == "" {
		message = "Internal server error"
	}
	return NewAPIError(ErrCodeInternal, message, http.StatusInternalServerError)
}

func NewDatabaseError(operation string, cause error) *APIError {
	return NewAPIError(ErrCodeDatabase, fmt.Sprintf("Database %s failed", operation), http.StatusInternalServerError).
		WithDetails("operation", operation).
		WithCause(cause)
}

func NewFileSystemError(operation string, cause error) *APIError {
	return NewAPIError(ErrCodeFileSystem, fmt.Sprintf("File system %s failed", operation), http.StatusInternalServerError).
		WithDetails("operation", operation).
		WithCause(cause)
}

func NewTimeoutError(operation string) *APIError {
	return NewAPIError(ErrCodeTimeout, fmt.Sprintf("Operation timed out: %s", operation), http.StatusRequestTimeout).
		WithDetails("operation", operation)
}

func NewRateLimitedError(message string) *APIError {
	if message == "" {
		message = "Rate limit exceeded"
	}
	return NewAPIError(ErrCodeRateLimited, message, http.StatusTooManyRequests)
}

func NewUnavailableError(service string) *APIError {
	return NewAPIError(ErrCodeUnavailable, fmt.Sprintf("Service unavailable: %s", service), http.StatusServiceUnavailable).
		WithDetails("service", service)
}

// Business Logic Errors
func NewOperationFailedError(operation string, reason string) *APIError {
	message := fmt.Sprintf("Operation failed: %s - %s", operation, reason)
	return NewAPIError(ErrCodeOperationFailed, message, http.StatusUnprocessableEntity).
		WithDetails("operation", operation).
		WithDetails("reason", reason)
}

func NewInvalidStateError(message string) *APIError {
	return NewAPIError(ErrCodeInvalidState, message, http.StatusConflict)
}

// NewSecretsLockedError reports that the secret store must be unlocked first.
// It is 423 Locked rather than 401, so clients don't mistake it for an
// expired session.
func NewSecretsLockedError() *APIError {
	return NewAPIError(ErrCodeSecretsLocked, "Secret store is locked. Unlock secrets and try again.", http.StatusLocked)
}

// NewSyncRemoteDivergedError reports a GitHub branch that has commits the
// wiki's history doesn't contain.
func NewSyncRemoteDivergedError(branch string) *APIError {
	message := fmt.Sprintf("The GitHub branch %q has commits that aren't in this wiki (for example a README "+
		"created with the repository), so pushing would lose them. Replace the branch with the wiki's "+
		"history, or use an empty repository or a new branch.", branch)
	return NewAPIError(ErrCodeSyncRemoteDiverged, message, http.StatusConflict).
		WithDetails("branch", branch)
}

// NewDocumentChangedError refuses a save made from an older version of the
// page. current is the page as it is now, for the client to offer.
func NewDocumentChangedError(current any) *APIError {
	return NewAPIError(ErrCodeDocumentChanged,
		"This page changed since you opened it (on GitHub or by someone else).", http.StatusConflict).
		WithDetails("document", current)
}

func WrapError(err error) *APIError {
	var apiErr *APIError
	if stderrors.As(err, &apiErr) {
		return apiErr
	}
	return NewInternalError("Internal server error").WithCause(err)
}

func IsAPIError(err error) bool {
	var apiErr *APIError
	return stderrors.As(err, &apiErr)
}

// HasCode reports whether err is (or wraps) an APIError with the given code.
func HasCode(err error, code ErrorCode) bool {
	var apiErr *APIError
	return stderrors.As(err, &apiErr) && apiErr.Code == code
}

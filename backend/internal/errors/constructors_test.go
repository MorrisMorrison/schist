package errors

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestConstructors_StatusAndCode(t *testing.T) {
	cause := fmt.Errorf("disk full")
	tests := []struct {
		name    string
		err     *APIError
		status  int
		code    ErrorCode
		message string
	}{
		{"invalid request", NewInvalidRequestError("bad body"), http.StatusBadRequest, ErrCodeInvalidRequest, "bad body"},
		{"unauthorized", NewUnauthorizedError("nope"), http.StatusUnauthorized, ErrCodeUnauthorized, "nope"},
		{"unauthorized default", NewUnauthorizedError(""), http.StatusUnauthorized, ErrCodeUnauthorized, "Authentication required"},
		{"forbidden", NewForbiddenError("no"), http.StatusForbidden, ErrCodeForbidden, "no"},
		{"forbidden default", NewForbiddenError(""), http.StatusForbidden, ErrCodeForbidden, "Access forbidden"},
		{"internal default", NewInternalError(""), http.StatusInternalServerError, ErrCodeInternal, "Internal server error"},
		{"filesystem", NewFileSystemError("write", cause), http.StatusInternalServerError, ErrCodeFileSystem, "File system write failed"},
		{"rate limited", NewRateLimitedError("slow down"), http.StatusTooManyRequests, ErrCodeRateLimited, "slow down"},
		{"rate limited default", NewRateLimitedError(""), http.StatusTooManyRequests, ErrCodeRateLimited, "Rate limit exceeded"},
		{"unavailable", NewUnavailableError("git"), http.StatusServiceUnavailable, ErrCodeUnavailable, "Service unavailable: git"},
		{"operation failed", NewOperationFailedError("sync", "no remote"), http.StatusUnprocessableEntity, ErrCodeOperationFailed, "Operation failed: sync - no remote"},
		{"invalid state", NewInvalidStateError("locked"), http.StatusConflict, ErrCodeInvalidState, "locked"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.status, tt.err.HTTPStatus)
			assert.Equal(t, tt.code, tt.err.Code)
			assert.Equal(t, tt.message, tt.err.Message)
			assert.True(t, HasCode(fmt.Errorf("wrapped: %w", tt.err), tt.code))
		})
	}

	fs := NewFileSystemError("write", cause)
	assert.Equal(t, "write", fs.Details["operation"])
	assert.ErrorIs(t, fs, cause)
	op := NewOperationFailedError("sync", "no remote")
	assert.Equal(t, "no remote", op.Details["reason"])
	assert.Equal(t, "git", NewUnavailableError("git").Details["service"])
}

func TestWithDetails_NilMap(t *testing.T) {
	e := &APIError{Code: ErrCodeValidation}
	e.WithDetails("field", "name")
	assert.Equal(t, "name", e.Details["field"])
}

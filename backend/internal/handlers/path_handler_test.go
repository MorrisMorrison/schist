package handlers

import (
	"testing"

	"github.com/MorrisMorrison/schist/internal/utils"
	"github.com/stretchr/testify/assert"
)

// TestEnsureLeadingSlashUsage tests that our handlers would use EnsureLeadingSlash consistently
func TestEnsureLeadingSlashUsage(t *testing.T) {
	testCases := []struct {
		name        string
		input       string
		expected    string
		description string
	}{
		{
			name:        "path_with_leading_slash",
			input:       "/docs/api",
			expected:    "/docs/api",
			description: "Path with leading slash should remain unchanged",
		},
		{
			name:        "path_without_leading_slash",
			input:       "docs/api",
			expected:    "/docs/api",
			description: "Path without leading slash should get one added",
		},
		{
			name:        "root_path",
			input:       "/",
			expected:    "/",
			description: "Root path should remain as is",
		},
		{
			name:        "empty_string_path",
			input:       "",
			expected:    "/",
			description: "Empty path should be converted to root",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := utils.EnsureLeadingSlash(tc.input)
			assert.Equal(t, tc.expected, result, tc.description)
		})
	}
}

// TestNormalizePathUsage tests the normalization that our handlers should apply
func TestNormalizePathUsage(t *testing.T) {
	testCases := []struct {
		name        string
		input       string
		expected    string
		description string
	}{
		{
			name:        "clean_path",
			input:       "/docs/api",
			expected:    "/docs/api",
			description: "Clean path should remain unchanged",
		},
		{
			name:        "path_with_trailing_slash",
			input:       "/docs/api/",
			expected:    "/docs/api",
			description: "Trailing slash should be removed",
		},
		{
			name:        "path_with_double_slashes",
			input:       "/docs//api",
			expected:    "/docs/api",
			description: "Double slashes should be collapsed",
		},
		{
			name:        "path_without_leading_slash",
			input:       "docs/api",
			expected:    "/docs/api",
			description: "Missing leading slash should be added",
		},
		{
			name:        "complex_messy_path",
			input:       "//docs///api//",
			expected:    "/docs/api",
			description: "Complex messy path should be fully normalized",
		},
		{
			name:        "root_path",
			input:       "/",
			expected:    "/",
			description: "Root path should remain as root",
		},
		{
			name:        "empty_path",
			input:       "",
			expected:    "/",
			description: "Empty path should become root",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := utils.NormalizePath(tc.input)
			assert.Equal(t, tc.expected, result, tc.description)
		})
	}
}

// TestPathValidationUsage tests path validation that should protect our handlers
func TestPathValidationUsage(t *testing.T) {
	validPaths := []string{
		"/",
		"/docs",
		"/docs/api",
		"/docs/api/v1",
		"/getting-started",
		"/user-guide",
		"/api-docs",
	}

	for _, path := range validPaths {
		t.Run("valid_path_"+path, func(t *testing.T) {
			err := utils.ValidatePath(path)
			assert.NoError(t, err, "Path %q should be valid", path)
		})
	}

	invalidPaths := []struct {
		path        string
		expectedErr error
	}{
		{"", utils.ErrEmptyPath},
		{"docs", utils.ErrPathMustStartWithSlash},
		{"/docs/../secret", utils.ErrPathContainsInvalidSegments},
		{"/docs/./current", utils.ErrPathContainsInvalidSegments},
		{"/docs@api", utils.ErrPathContainsInvalidCharacters},
		{"/a/b/c/d/e/f/g/h/i/j/k", utils.ErrPathTooDeep},
	}

	for _, tc := range invalidPaths {
		t.Run("invalid_path_"+tc.path, func(t *testing.T) {
			err := utils.ValidatePath(tc.path)
			assert.ErrorIs(t, err, tc.expectedErr, "Path %q should be invalid with specific error", tc.path)
		})
	}
}

// TestAssetPathHandling tests asset path specific handling
func TestAssetPathHandling(t *testing.T) {
	testCases := []struct {
		name        string
		input       string
		shouldError bool
		description string
	}{
		{
			name:        "valid_asset_path",
			input:       "/assets/image.png",
			shouldError: false,
			description: "Valid asset path should pass validation",
		},
		{
			name:        "valid_nested_asset_path",
			input:       "/assets/folder/image.jpg",
			shouldError: false,
			description: "Valid nested asset path should pass validation",
		},
		{
			name:        "valid_alternative_asset_path",
			input:       "/images/test.png",
			shouldError: false,
			description: "Valid asset path structure should pass validation",
		},
		{
			name:        "asset_path_without_leading_slash",
			input:       "assets/test.png",
			shouldError: true,
			description: "Asset path without leading slash should fail validation",
		},
		{
			name:        "asset_path_with_invalid_characters",
			input:       "/assets/test@file.png",
			shouldError: true,
			description: "Asset path with invalid characters should fail validation",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := utils.ValidateAssetPath(tc.input)
			if tc.shouldError {
				assert.Error(t, err, tc.description)
			} else {
				assert.NoError(t, err, tc.description)
			}
		})
	}
}

// TestSafeFilePathHandling tests safe file path construction
func TestSafeFilePathHandling(t *testing.T) {
	dataDir := "/tmp/test-data"

	testCases := []struct {
		name        string
		input       string
		shouldError bool
		description string
	}{
		{
			name:        "safe_path",
			input:       "/assets/image.png",
			shouldError: false,
			description: "Safe asset path should work",
		},
		{
			name:        "potentially_dangerous_path",
			input:       "/assets/../../../etc/passwd",
			shouldError: true,
			description: "Path traversal should be rejected",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := utils.SafeFilePath(dataDir, tc.input)
			if tc.shouldError {
				assert.Error(t, err, tc.description)
			} else {
				assert.NoError(t, err, tc.description)
			}
		})
	}
}

// TestBuildFilePathConsistency tests that file paths are built consistently
func TestBuildFilePathConsistency(t *testing.T) {
	dataDir := "/var/lib/schist"

	testCases := []struct {
		input    string
		expected string
	}{
		{"/docs", "/var/lib/schist/docs"},
		{"/docs/api", "/var/lib/schist/docs/api"},
		{"docs/api", "/var/lib/schist/docs/api"}, // Should still work after normalization
		{"/", "/var/lib/schist"},
	}

	for _, tc := range testCases {
		t.Run("build_path_"+tc.input, func(t *testing.T) {
			result := utils.BuildFilePath(dataDir, tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}

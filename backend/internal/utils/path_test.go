package utils

import (
	"path/filepath"
	"testing"
)

func TestValidatePath(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		wantErr  bool
		expected error
	}{
		{
			name:     "valid root path",
			path:     "/",
			wantErr:  false,
			expected: nil,
		},
		{
			name:     "valid simple path",
			path:     "/docs",
			wantErr:  false,
			expected: nil,
		},
		{
			name:     "valid nested path",
			path:     "/docs/api/v1",
			wantErr:  false,
			expected: nil,
		},
		{
			name:     "empty path",
			path:     "",
			wantErr:  true,
			expected: ErrEmptyPath,
		},
		{
			name:     "path without leading slash",
			path:     "docs",
			wantErr:  true,
			expected: ErrPathMustStartWithSlash,
		},
		{
			name:     "path with dot segments",
			path:     "/docs/./api",
			wantErr:  true,
			expected: ErrPathContainsInvalidSegments,
		},
		{
			name:     "path with double dot segments",
			path:     "/docs/../api",
			wantErr:  true,
			expected: ErrPathContainsInvalidSegments,
		},
		{
			name:     "path with invalid characters",
			path:     "/docs/api@v1",
			wantErr:  true,
			expected: ErrPathContainsInvalidCharacters,
		},
		{
			name:     "path too deep",
			path:     "/a/b/c/d/e/f/g/h/i/j/k",
			wantErr:  true,
			expected: ErrPathTooDeep,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePath(tt.path)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidatePath() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if tt.wantErr && err != tt.expected {
				t.Errorf("ValidatePath() error = %v, expected %v", err, tt.expected)
			}
		})
	}
}

func TestSanitizePath(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		expected string
	}{
		{
			name:     "empty path",
			path:     "",
			expected: "/",
		},
		{
			name:     "simple path with spaces",
			path:     "Getting Started",
			expected: "/getting-started",
		},
		{
			name:     "path with special characters",
			path:     "/API Documentation!",
			expected: "/api-documentation",
		},
		{
			name:     "path with multiple slashes",
			path:     "//docs///api//",
			expected: "/docs/api",
		},
		{
			name:     "path with multiple hyphens",
			path:     "/docs---api",
			expected: "/docs-api",
		},
		{
			name:     "complex path",
			path:     "User Guide & API Reference",
			expected: "/user-guide-api-reference",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := SanitizePath(tt.path)
			if result != tt.expected {
				t.Errorf("SanitizePath() = %v, expected %v", result, tt.expected)
			}
		})
	}
}

func TestNormalizePath(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		expected string
	}{
		{
			name:     "empty path",
			path:     "",
			expected: "/",
		},
		{
			name:     "root path",
			path:     "/",
			expected: "/",
		},
		{
			name:     "path with trailing slash",
			path:     "/docs/",
			expected: "/docs",
		},
		{
			name:     "path with multiple slashes",
			path:     "//docs///api//",
			expected: "/docs/api",
		},
		{
			name:     "path without leading slash",
			path:     "docs/api",
			expected: "/docs/api",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := NormalizePath(tt.path)
			if result != tt.expected {
				t.Errorf("NormalizePath() = %v, expected %v", result, tt.expected)
			}
		})
	}
}

func TestIsValidFolderName(t *testing.T) {
	tests := []struct {
		name     string
		folder   string
		expected bool
	}{
		{
			name:     "valid simple name",
			folder:   "docs",
			expected: true,
		},
		{
			name:     "valid name with hyphens",
			folder:   "api-reference",
			expected: true,
		},
		{
			name:     "valid name with numbers",
			folder:   "api-v1",
			expected: true,
		},
		{
			name:     "empty name",
			folder:   "",
			expected: false,
		},
		{
			name:     "dot segment",
			folder:   ".",
			expected: false,
		},
		{
			name:     "double dot segment",
			folder:   "..",
			expected: false,
		},
		{
			name:     "uppercase letters",
			folder:   "Docs",
			expected: false,
		},
		{
			name:     "special characters",
			folder:   "api@v1",
			expected: false,
		},
		{
			name:     "underscores",
			folder:   "api_reference",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsValidFolderName(tt.folder)
			if result != tt.expected {
				t.Errorf("IsValidFolderName() = %v, expected %v", result, tt.expected)
			}
		})
	}
}

func TestBuildFilePath(t *testing.T) {
	tests := []struct {
		name     string
		dataDir  string
		path     string
		expected string
	}{
		{
			name:     "simple path",
			dataDir:  "/data",
			path:     "/docs",
			expected: filepath.Join("/data", "docs"),
		},
		{
			name:     "nested path",
			dataDir:  "/var/lib/schist",
			path:     "/docs/api/v1",
			expected: filepath.Join("/var/lib/schist", "docs", "api", "v1"),
		},
		{
			name:     "root path",
			dataDir:  "/data",
			path:     "/",
			expected: filepath.Join("/data"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := BuildFilePath(tt.dataDir, tt.path)
			if result != tt.expected {
				t.Errorf("BuildFilePath() = %v, expected %v", result, tt.expected)
			}
		})
	}
}

func TestExtractSlugFromPath(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		expected string
	}{
		{
			name:     "empty path",
			path:     "",
			expected: "index",
		},
		{
			name:     "root path",
			path:     "/",
			expected: "index",
		},
		{
			name:     "simple path",
			path:     "/docs",
			expected: "docs",
		},
		{
			name:     "nested path",
			path:     "/docs/api/v1",
			expected: "v1",
		},
		{
			name:     "path with trailing slash",
			path:     "/docs/api/",
			expected: "api",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ExtractSlugFromPath(tt.path)
			if result != tt.expected {
				t.Errorf("ExtractSlugFromPath() = %v, expected %v", result, tt.expected)
			}
		})
	}
}

package utils

import (
	"errors"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	MaxPathDepth  = 10
	PathSeparator = "/"
)

var (
	ErrPathMustStartWithSlash        = errors.New("path must start with '/'")
	ErrPathContainsInvalidSegments   = errors.New("path cannot contain '.' or '..' segments")
	ErrPathContainsInvalidCharacters = errors.New("path contains invalid characters")
	ErrPathTooDeep                   = errors.New("path exceeds maximum depth of 10 levels")
	ErrEmptyPath                     = errors.New("path cannot be empty")
)

// validPathRegex matches valid path characters: letters, numbers, hyphens, underscores, forward slashes
var validPathRegex = regexp.MustCompile(`^[a-zA-Z0-9\-_/]+$`)

// validFolderNameRegex matches valid folder names: lowercase letters, numbers, hyphens
var validFolderNameRegex = regexp.MustCompile(`^[a-z0-9\-]+$`)

// ValidatePath validates that a path is safe and follows our rules.
// Rules:
// - Must start with "/"
// - No ".." or "." segments allowed
// - Only letters, numbers, hyphens, underscores, and forward slashes
// - Maximum depth of 10 levels
func ValidatePath(path string) error {
	if path == "" {
		return ErrEmptyPath
	}

	if !strings.HasPrefix(path, PathSeparator) {
		return ErrPathMustStartWithSlash
	}

	// Split path into segments and validate each
	segments := strings.Split(strings.Trim(path, PathSeparator), PathSeparator)

	// Remove empty segments from consecutive slashes
	var cleanSegments []string
	for _, segment := range segments {
		if segment != "" {
			cleanSegments = append(cleanSegments, segment)
		}
	}

	// Check for invalid segments first (. and ..)
	for _, segment := range cleanSegments {
		if segment == "." || segment == ".." {
			return ErrPathContainsInvalidSegments
		}
	}

	// Check for invalid characters
	if !validPathRegex.MatchString(path) {
		return ErrPathContainsInvalidCharacters
	}

	// Check depth
	if len(cleanSegments) > MaxPathDepth {
		return ErrPathTooDeep
	}

	return nil
}

// SanitizePath cleans up a path to make it safe.
// It removes invalid characters, converts to lowercase, replaces spaces with hyphens,
// and ensures proper format.
func SanitizePath(path string) string {
	if path == "" {
		return PathSeparator
	}

	// Convert to lowercase
	path = strings.ToLower(path)

	// Replace spaces with hyphens
	path = strings.ReplaceAll(path, " ", "-")

	// Remove invalid characters (keep only letters, numbers, hyphens, underscores, slashes)
	reg := regexp.MustCompile(`[^a-z0-9\-_/]`)
	path = reg.ReplaceAllString(path, "")

	// Clean up multiple consecutive hyphens
	path = regexp.MustCompile(`-+`).ReplaceAllString(path, "-")

	// Clean up multiple consecutive slashes
	path = regexp.MustCompile(`/+`).ReplaceAllString(path, PathSeparator)

	// Ensure it starts with a slash
	if !strings.HasPrefix(path, PathSeparator) {
		path = PathSeparator + path
	}

	// Remove trailing slashes (except for root)
	if len(path) > 1 {
		path = strings.TrimSuffix(path, PathSeparator)
	}

	// Remove leading and trailing hyphens from segments
	segments := strings.Split(strings.Trim(path, PathSeparator), PathSeparator)
	var cleanSegments []string
	for _, segment := range segments {
		if segment != "" {
			segment = strings.Trim(segment, "-")
			if segment != "" {
				cleanSegments = append(cleanSegments, segment)
			}
		}
	}

	if len(cleanSegments) == 0 {
		return PathSeparator
	}

	return PathSeparator + strings.Join(cleanSegments, PathSeparator)
}

// NormalizePath normalizes path format by removing trailing slashes
// and cleaning up multiple consecutive slashes.
func NormalizePath(path string) string {
	if path == "" {
		return PathSeparator
	}

	// Clean up multiple consecutive slashes
	path = regexp.MustCompile(`/+`).ReplaceAllString(path, PathSeparator)

	// Remove trailing slashes (except for root)
	if len(path) > 1 {
		path = strings.TrimSuffix(path, PathSeparator)
	}

	// Ensure it starts with a slash
	if !strings.HasPrefix(path, PathSeparator) {
		path = PathSeparator + path
	}

	return path
}

// IsValidFolderName checks if a folder name is valid.
// Valid folder names are lowercase with hyphens, numbers, and letters only.
func IsValidFolderName(name string) bool {
	if name == "" || name == "." || name == ".." {
		return false
	}

	return validFolderNameRegex.MatchString(name)
}

// BuildFilePath builds a full filesystem path for a page given the data directory
// and the logical path. Uses filepath package for cross-platform compatibility.
func BuildFilePath(dataDir, path string) string {
	// Normalize the path first
	normalizedPath := NormalizePath(path)

	// Remove leading slash for filepath operations
	relativePath := strings.TrimPrefix(normalizedPath, PathSeparator)

	// Convert forward slashes to OS-specific separators
	osPath := filepath.FromSlash(relativePath)

	// Join with data directory
	return filepath.Join(dataDir, osPath)
}

// ExtractSlugFromPath gets the last segment of a path as a slug.
// This is used for generating filenames from paths.
func ExtractSlugFromPath(path string) string {
	if path == "" || path == PathSeparator {
		return "index"
	}

	// Normalize the path first
	normalizedPath := NormalizePath(path)

	// Split into segments
	segments := strings.Split(strings.Trim(normalizedPath, PathSeparator), PathSeparator)

	// Get the last non-empty segment
	for i := len(segments) - 1; i >= 0; i-- {
		if segments[i] != "" {
			return segments[i]
		}
	}

	return "index"
}

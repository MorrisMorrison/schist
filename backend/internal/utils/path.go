package utils

import (
	"errors"
	"fmt"
	"os"
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

// validAssetPathRegex matches valid asset path characters:
// letters, numbers, hyphens, underscores, forward slashes, dots
var validAssetPathRegex = regexp.MustCompile(`^[a-zA-Z0-9\-_/.]+$`)

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

	segments := strings.Split(strings.Trim(path, PathSeparator), PathSeparator)

	var cleanSegments []string
	for _, segment := range segments {
		if segment != "" {
			cleanSegments = append(cleanSegments, segment)
		}
	}

	for _, segment := range cleanSegments {
		if segment == "." || segment == ".." {
			return ErrPathContainsInvalidSegments
		}
	}

	if !validPathRegex.MatchString(path) {
		return ErrPathContainsInvalidCharacters
	}

	if len(cleanSegments) > MaxPathDepth {
		return ErrPathTooDeep
	}

	return nil
}

func SanitizePath(path string) string {
	if path == "" {
		return PathSeparator
	}

	path = strings.ToLower(path)

	path = strings.ReplaceAll(path, " ", "-")

	// only letters, numbers, hyphens, underscores, slashes
	reg := regexp.MustCompile(`[^a-z0-9\-_/]`)
	path = reg.ReplaceAllString(path, "")

	// Clean up multiple consecutive hyphens
	path = regexp.MustCompile(`-+`).ReplaceAllString(path, "-")

	// Clean up multiple consecutive slashes
	path = regexp.MustCompile(`/+`).ReplaceAllString(path, PathSeparator)

	if !strings.HasPrefix(path, PathSeparator) {
		path = PathSeparator + path
	}

	if len(path) > 1 {
		path = strings.TrimSuffix(path, PathSeparator)
	}

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

func NormalizePath(path string) string {
	if path == "" {
		return PathSeparator
	}

	path = regexp.MustCompile(`/+`).ReplaceAllString(path, PathSeparator)

	if len(path) > 1 {
		path = strings.TrimSuffix(path, PathSeparator)
	}

	if !strings.HasPrefix(path, PathSeparator) {
		path = PathSeparator + path
	}

	return path
}

func IsValidFolderName(name string) bool {
	if name == "" || name == "." || name == ".." {
		return false
	}

	return validFolderNameRegex.MatchString(name)
}

func BuildFilePath(dataDir, path string) string {
	normalizedPath := NormalizePath(path)

	relativePath := strings.TrimPrefix(normalizedPath, PathSeparator)

	osPath := filepath.FromSlash(relativePath)

	return filepath.Join(dataDir, osPath)
}

func ExtractSlugFromPath(path string) string {
	if path == "" || path == PathSeparator {
		return "index"
	}

	normalizedPath := NormalizePath(path)

	segments := strings.Split(strings.Trim(normalizedPath, PathSeparator), PathSeparator)

	for i := len(segments) - 1; i >= 0; i-- {
		if segments[i] != "" {
			return segments[i]
		}
	}

	return "index"
}

// ValidateAssetPath validates asset paths, allowing dots for file extensions.
// Uses the same base rules as ValidatePath but permits dots in filenames.
func ValidateAssetPath(path string) error {
	if path == "" {
		return ErrEmptyPath
	}

	if !strings.HasPrefix(path, PathSeparator) {
		return ErrPathMustStartWithSlash
	}

	segments := strings.Split(strings.Trim(path, PathSeparator), PathSeparator)

	var cleanSegments []string
	for _, segment := range segments {
		if segment != "" {
			cleanSegments = append(cleanSegments, segment)
		}
	}

	for _, segment := range cleanSegments {
		if segment == "." || segment == ".." {
			return ErrPathContainsInvalidSegments
		}
	}

	if !validAssetPathRegex.MatchString(path) {
		return ErrPathContainsInvalidCharacters
	}

	// Check depth
	if len(cleanSegments) > MaxPathDepth {
		return ErrPathTooDeep
	}

	return nil
}

// SafeFilePath validates a path and returns a safe file path within the given data directory.
// This function prevents directory traversal attacks by ensuring the resolved path
// stays within the data directory.
func SafeFilePath(dataDir, path string) (string, error) {
	if err := ValidateAssetPath(path); err != nil {
		return "", err
	}

	cleanPath := strings.TrimPrefix(path, PathSeparator)

	fullPath := filepath.Join(dataDir, cleanPath)

	absDataDir, err := filepath.Abs(dataDir)
	if err != nil {
		return "", fmt.Errorf("failed to resolve data directory: %w", err)
	}

	absFullPath, err := filepath.Abs(fullPath)
	if err != nil {
		return "", fmt.Errorf("failed to resolve asset path: %w", err)
	}

	// Ensure the resolved path stays within the data directory. Using
	// filepath.Rel avoids the sibling-prefix bypass that a plain HasPrefix
	// check has (e.g. "/app/data-evil" would otherwise match "/app/data").
	rel, err := filepath.Rel(absDataDir, absFullPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid asset path: outside data directory")
	}

	return fullPath, nil
}

func EnsureLeadingSlash(path string) string {
	if !strings.HasPrefix(path, PathSeparator) {
		return PathSeparator + path
	}
	return path
}

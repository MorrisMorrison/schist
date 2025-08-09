package services

import (
	"path/filepath"
	"strings"
)

// IgnoreService manages simple hardcoded patterns for files and folders that should be excluded
type IgnoreService struct {
	dataDir string
}

func NewIgnoreService(dataDir string) *IgnoreService {
	return &IgnoreService{
		dataDir: dataDir,
	}
}

func (i *IgnoreService) ShouldIgnore(path string) bool {
	cleanPath := strings.TrimPrefix(path, "/")

	patterns := []string{
		".schist/",
		".git/",
		"trash/",
		"uploads/",
		"assets/",
		"invites/",
	}

	for _, pattern := range patterns {
		if i.matchesPattern(cleanPath, pattern) {
			return true
		}
	}

	return false
}

func (i *IgnoreService) ShouldIgnoreFile(filePath string) bool {
	relPath, err := filepath.Rel(i.dataDir, filePath)
	if err != nil {
		return false
	}

	relPath = filepath.ToSlash(relPath)

	if i.ShouldIgnore(relPath) {
		return true
	}

	return i.shouldIgnoreFilePattern(relPath)
}

func (i *IgnoreService) shouldIgnoreFilePattern(filePath string) bool {
	fileName := filepath.Base(filePath)
	lowerFileName := strings.ToLower(fileName)

	systemPatterns := []string{
		".log",
		".tmp",
		".temp",
		".github",
		".gitignore",
		".gitattributes",
	}

	for _, pattern := range systemPatterns {
		if strings.Contains(lowerFileName, pattern) {
			return true
		}
	}

	return false
}

func (i *IgnoreService) matchesPattern(path, pattern string) bool {
	if strings.HasSuffix(pattern, "/") {
		return strings.HasPrefix(path, pattern) || path+"/" == pattern
	}

	return path == pattern
}

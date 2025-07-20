package services

import (
	"crypto/md5"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/utils"
)

const (
	MAX_IMAGE_SIZE = 10 << 20 // 10MB
	ASSETS_DIR     = "assets"
	IMAGES_DIR     = "images"
)

var ALLOWED_IMAGE_TYPES = map[string]bool{
	"image/jpeg":    true,
	"image/jpg":     true,
	"image/png":     true,
	"image/gif":     true,
	"image/webp":    true,
	"image/svg+xml": true,
}

var ALLOWED_EXTENSIONS = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".gif":  true,
	".webp": true,
	".svg":  true,
}

type AssetService struct {
	dataDir string
}

func NewAssetService(dataDir string) *AssetService {
	return &AssetService{
		dataDir: dataDir,
	}
}

func (s *AssetService) UploadImage(file *multipart.FileHeader) (*models.Asset, error) {
	if err := s.validateImageFile(file); err != nil {
		return nil, err
	}

	src, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to open uploaded file: %w", err)
	}
	defer src.Close()

	// Generate unique filename to prevent conflicts
	filename, err := s.generateUniqueFilename(file.Filename)
	if err != nil {
		return nil, fmt.Errorf("failed to generate filename: %w", err)
	}

	// Create asset directory structure
	assetDir := filepath.Join(s.dataDir, ASSETS_DIR, IMAGES_DIR)
	if mkdirErr := os.MkdirAll(assetDir, 0755); mkdirErr != nil {
		return nil, fmt.Errorf("failed to create asset directory: %w", mkdirErr)
	}

	// Create destination file
	destPath := filepath.Join(assetDir, filename)
	dst, err := os.Create(destPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create destination file: %w", err)
	}
	defer dst.Close()

	// Copy file contents
	size, err := io.Copy(dst, src)
	if err != nil {
		return nil, fmt.Errorf("failed to save file: %w", err)
	}

	// Create asset metadata
	asset := &models.Asset{
		Name:         filename,
		OriginalName: file.Filename,
		Path:         filepath.Join("/", ASSETS_DIR, IMAGES_DIR, filename),
		Size:         size,
		ContentType:  file.Header.Get("Content-Type"),
		Created:      time.Now(),
	}

	return asset, nil
}

func (s *AssetService) GetAssetPath(relativePath string) (string, error) {
	// Basic path validation for assets (allow dots for file extensions)
	if relativePath == "" {
		return "", fmt.Errorf("asset path cannot be empty")
	}

	if !strings.HasPrefix(relativePath, "/") {
		return "", fmt.Errorf("asset path must start with '/'")
	}

	// Prevent directory traversal
	if strings.Contains(relativePath, "..") {
		return "", fmt.Errorf("asset path cannot contain '..'")
	}

	// Additional asset-specific validation (allow dots for file extensions)
	// Only allow alphanumeric, hyphens, underscores, forward slashes, and dots
	validAssetPathRegex := `^[a-zA-Z0-9\-_/.]+$`
	matched, err := regexp.MatchString(validAssetPathRegex, relativePath)
	if err != nil {
		return "", fmt.Errorf("failed to validate asset path: %w", err)
	}
	if !matched {
		return "", fmt.Errorf("invalid asset path: path contains invalid characters")
	}

	// Remove leading slash if present
	cleanPath := strings.TrimPrefix(relativePath, "/")

	// Build full file path
	fullPath := filepath.Join(s.dataDir, cleanPath)

	// Ensure path is within dataDir for security
	absDataDir, err := filepath.Abs(s.dataDir)
	if err != nil {
		return "", fmt.Errorf("failed to resolve data directory: %w", err)
	}

	absFullPath, err := filepath.Abs(fullPath)
	if err != nil {
		return "", fmt.Errorf("failed to resolve asset path: %w", err)
	}

	if !strings.HasPrefix(absFullPath, absDataDir) {
		return "", fmt.Errorf("invalid asset path: outside data directory")
	}

	// Check if file exists
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return "", fmt.Errorf("asset not found: %s", relativePath)
	}

	return fullPath, nil
}

func (s *AssetService) DeleteAsset(relativePath string) error {
	fullPath, err := s.GetAssetPath(relativePath)
	if err != nil {
		return err
	}

	if err := os.Remove(fullPath); err != nil {
		return fmt.Errorf("failed to delete asset: %w", err)
	}

	return nil
}

func (s *AssetService) validateImageFile(file *multipart.FileHeader) error {
	// Check file size
	if file.Size > MAX_IMAGE_SIZE {
		return fmt.Errorf("file too large: %d bytes (max %d bytes)", file.Size, MAX_IMAGE_SIZE)
	}

	// Check file extension
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !ALLOWED_EXTENSIONS[ext] {
		return fmt.Errorf("unsupported file extension: %s", ext)
	}

	// Check content type
	contentType := file.Header.Get("Content-Type")
	if !ALLOWED_IMAGE_TYPES[contentType] {
		return fmt.Errorf("unsupported content type: %s", contentType)
	}

	return nil
}

func (s *AssetService) generateUniqueFilename(originalName string) (string, error) {
	ext := filepath.Ext(originalName)
	nameWithoutExt := strings.TrimSuffix(originalName, ext)

	// Generate hash of original name + timestamp for uniqueness
	hash := md5.Sum([]byte(fmt.Sprintf("%s_%d", nameWithoutExt, time.Now().UnixNano())))
	hashStr := fmt.Sprintf("%x", hash)

	// Take first 8 characters of hash
	shortHash := hashStr[:8]

	// Create filename: originalname_hash.ext
	filename := fmt.Sprintf("%s_%s%s", nameWithoutExt, shortHash, ext)

	// Sanitize filename for filesystem
	filename = utils.GenerateSlug(filename) + ext

	return filename, nil
}

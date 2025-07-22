package services

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
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

var allowedImageTypes = map[string]bool{
	"image/jpeg":    true,
	"image/jpg":     true,
	"image/png":     true,
	"image/gif":     true,
	"image/webp":    true,
	"image/svg+xml": true,
}

var allowedExtensions = map[string]bool{
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

	filename, err := s.generateUniqueFilename(file.Filename)
	if err != nil {
		return nil, fmt.Errorf("failed to generate filename: %w", err)
	}

	assetDir := filepath.Join(s.dataDir, ASSETS_DIR, IMAGES_DIR)
	if mkdirErr := os.MkdirAll(assetDir, 0755); mkdirErr != nil {
		return nil, fmt.Errorf("failed to create asset directory: %w", mkdirErr)
	}

	destPath := filepath.Join(assetDir, filename)
	dst, err := os.Create(destPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create destination file: %w", err)
	}
	defer dst.Close()

	size, err := io.Copy(dst, src)
	if err != nil {
		return nil, fmt.Errorf("failed to save file: %w", err)
	}

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
	if relativePath == "" {
		return "", fmt.Errorf("asset path cannot be empty")
	}

	if !strings.HasPrefix(relativePath, "/") {
		return "", fmt.Errorf("asset path must start with '/'")
	}

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

	cleanPath := strings.TrimPrefix(relativePath, "/")

	fullPath := filepath.Join(s.dataDir, cleanPath)

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
	if file.Size > MAX_IMAGE_SIZE {
		return fmt.Errorf("file too large: %d bytes (max %d bytes)", file.Size, MAX_IMAGE_SIZE)
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedExtensions[ext] {
		return fmt.Errorf("unsupported file extension: %s", ext)
	}

	contentType := file.Header.Get("Content-Type")
	if !allowedImageTypes[contentType] {
		return fmt.Errorf("unsupported content type: %s", contentType)
	}

	return nil
}

func (s *AssetService) generateUniqueFilename(originalName string) (string, error) {
	ext := filepath.Ext(originalName)
	nameWithoutExt := strings.TrimSuffix(originalName, ext)

	// Generate random bytes for uniqueness
	randomBytes := make([]byte, 8)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	// Create hash with name, timestamp, and random data
	hasher := md5.New()
	hasher.Write([]byte(fmt.Sprintf("%s_%d", nameWithoutExt, time.Now().UnixNano())))
	hasher.Write(randomBytes)
	hashBytes := hasher.Sum(nil)

	// Use first 8 characters of hex representation
	shortHash := hex.EncodeToString(hashBytes)[:8]

	filename := fmt.Sprintf("%s_%s%s", nameWithoutExt, shortHash, ext)

	filename = utils.GenerateSlug(filename) + ext

	return filename, nil
}

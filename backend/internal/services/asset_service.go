package services

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
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

// allowedImageTypes is matched against the client-supplied Content-Type header.
// This is a cheap first-pass filter only; the authoritative check is the
// content sniffing in validateImageContent. SVG is intentionally excluded
// because it can carry embedded JavaScript and lead to stored XSS when served.
var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/jpg":  true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

var allowedExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".gif":  true,
	".webp": true,
}

// allowedSniffedTypes is the authoritative allowlist of genuine raster image
// types, matched against the type detected from the actual file bytes via
// http.DetectContentType. Unlike the header- and extension-based checks above,
// these values are derived from attacker-uncontrolled content. SVG is excluded
// by design (script-capable, no magic-byte signature anyway).
var allowedSniffedTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
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

	// Sniff the real content type from the leading bytes rather than trusting
	// the attacker-controlled Content-Type header / filename extension. The
	// bytes we read for sniffing are stitched back in front of the reader via
	// io.MultiReader so the subsequent copy still writes the full file.
	header := make([]byte, 512)
	n, err := io.ReadFull(src, header)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return nil, fmt.Errorf("failed to read file header: %w", err)
	}
	header = header[:n]

	// http.DetectContentType may append a charset (e.g. "; charset=utf-8");
	// strip it before matching against the allowlist.
	sniffedType, _, _ := strings.Cut(http.DetectContentType(header), ";")
	if !allowedSniffedTypes[sniffedType] {
		return nil, fmt.Errorf("file content is not a supported image type: %s", sniffedType)
	}

	// Reassemble the full stream: the sniffed header bytes followed by the rest.
	fullSrc := io.MultiReader(bytes.NewReader(header), src)

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

	// Bound the copy so a lying Content-Length can't write an oversized file.
	// Read one byte past the limit so we can detect (and reject) an overflow.
	limited := io.LimitReader(fullSrc, MAX_IMAGE_SIZE+1)
	size, err := io.Copy(dst, limited)
	if err != nil {
		return nil, fmt.Errorf("failed to save file: %w", err)
	}
	if size > MAX_IMAGE_SIZE {
		// Remove the partial/oversized file we just started writing.
		_ = dst.Close()
		_ = os.Remove(destPath)
		return nil, fmt.Errorf("file too large: exceeds max %d bytes", MAX_IMAGE_SIZE)
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
	fullPath, err := utils.SafeFilePath(s.dataDir, relativePath)
	if err != nil {
		return "", err
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

	// Generate random bytes for uniqueness.
	randomBytes := make([]byte, 8)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}
	suffix := hex.EncodeToString(randomBytes)

	filename := fmt.Sprintf("%s_%s%s", nameWithoutExt, suffix, ext)

	filename = utils.GenerateSlug(filename) + ext

	return filename, nil
}

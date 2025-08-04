package services_test

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Test image data - minimal valid PNG (1x1 transparent pixel)
var testImageData = []byte{
	0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
	0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
	0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0xDA, 0x62, 0xF8, 0x0F, 0x00, 0x01,
	0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
	0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
}

func createMultipartFile(filename string, data []byte, contentType string) (*multipart.FileHeader, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("failed to create form file: %w", err)
	}

	_, err = part.Write(data)
	if err != nil {
		return nil, fmt.Errorf("failed to write data: %w", err)
	}

	err = writer.Close()
	if err != nil {
		return nil, fmt.Errorf("failed to close writer: %w", err)
	}

	// Parse the multipart form to get the FileHeader
	boundary := writer.Boundary()

	reader := multipart.NewReader(body, boundary)
	form, err := reader.ReadForm(int64(len(data)) + 1024)
	if err != nil {
		return nil, fmt.Errorf("failed to read form: %w", err)
	}
	defer form.RemoveAll()

	files := form.File["file"]
	if len(files) == 0 {
		return nil, io.EOF
	}

	fileHeader := files[0]
	// Set the content type manually since multipart.FileHeader doesn't preserve it automatically
	if fileHeader.Header == nil {
		fileHeader.Header = make(map[string][]string)
	}
	fileHeader.Header.Set("Content-Type", contentType)

	return fileHeader, nil
}

func TestAssetService_UploadImage(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	assetService := services.NewAssetService(testDir)

	t.Run("uploads valid PNG image successfully", func(t *testing.T) {
		fileHeader, err := createMultipartFile("test.png", testImageData, "image/png")
		require.NoError(t, err)

		asset, err := assetService.UploadImage(fileHeader)

		assert.NoError(t, err)
		assert.NotNil(t, asset)
		assert.Equal(t, "test.png", asset.OriginalName)
		assert.True(t, strings.HasSuffix(asset.Name, ".png"))
		assert.True(t, strings.HasPrefix(asset.Name, "test_"))
		assert.Equal(t, "/assets/images/"+asset.Name, asset.Path)
		assert.Equal(t, int64(len(testImageData)), asset.Size)
		assert.Equal(t, "image/png", asset.ContentType)
		assert.False(t, asset.Created.IsZero())

		// Verify file was created on disk
		expectedPath := filepath.Join(testDir, "assets", "images", asset.Name)
		_, err = os.Stat(expectedPath)
		assert.NoError(t, err)

		// Verify file content
		content, err := os.ReadFile(expectedPath)
		assert.NoError(t, err)
		assert.Equal(t, testImageData, content)
	})

	t.Run("uploads valid JPEG image successfully", func(t *testing.T) {
		// Minimal JPEG data
		jpegData := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9}

		fileHeader, err := createMultipartFile("photo.jpg", jpegData, "image/jpeg")
		require.NoError(t, err)

		asset, err := assetService.UploadImage(fileHeader)

		assert.NoError(t, err)
		assert.NotNil(t, asset)
		assert.Equal(t, "photo.jpg", asset.OriginalName)
		assert.True(t, strings.HasSuffix(asset.Name, ".jpg"))
		assert.Equal(t, "image/jpeg", asset.ContentType)
	})

	t.Run("generates unique filenames for same original name", func(t *testing.T) {
		fileHeader1, err := createMultipartFile("same.png", testImageData, "image/png")
		require.NoError(t, err)

		fileHeader2, err := createMultipartFile("same.png", testImageData, "image/png")
		require.NoError(t, err)

		asset1, err := assetService.UploadImage(fileHeader1)
		require.NoError(t, err)

		asset2, err := assetService.UploadImage(fileHeader2)
		require.NoError(t, err)

		// Should have different names despite same original name
		assert.NotEqual(t, asset1.Name, asset2.Name)
		assert.True(t, strings.HasPrefix(asset1.Name, "same_"))
		assert.True(t, strings.HasPrefix(asset2.Name, "same_"))
		assert.True(t, strings.HasSuffix(asset1.Name, ".png"))
		assert.True(t, strings.HasSuffix(asset2.Name, ".png"))
	})

	t.Run("rejects file that exceeds size limit", func(t *testing.T) {
		// Create data larger than 10MB limit
		largeData := make([]byte, 11*1024*1024) // 11MB
		copy(largeData, testImageData)          // Start with valid PNG header

		fileHeader, err := createMultipartFile("large.png", largeData, "image/png")
		require.NoError(t, err)

		asset, err := assetService.UploadImage(fileHeader)

		assert.Error(t, err)
		assert.Nil(t, asset)
		assert.Contains(t, err.Error(), "file too large")
	})

	t.Run("rejects unsupported file extension", func(t *testing.T) {
		fileHeader, err := createMultipartFile("document.pdf", []byte("fake pdf"), "application/pdf")
		require.NoError(t, err)

		asset, err := assetService.UploadImage(fileHeader)

		assert.Error(t, err)
		assert.Nil(t, asset)
		assert.Contains(t, err.Error(), "unsupported file extension")
	})

	t.Run("rejects unsupported content type", func(t *testing.T) {
		fileHeader, err := createMultipartFile("fake.png", testImageData, "text/plain")
		require.NoError(t, err)

		asset, err := assetService.UploadImage(fileHeader)

		assert.Error(t, err)
		assert.Nil(t, asset)
		assert.Contains(t, err.Error(), "unsupported content type")
	})

	t.Run("handles filename with special characters", func(t *testing.T) {
		fileHeader, err := createMultipartFile("special!@#$%^&*()characters.png", testImageData, "image/png")
		require.NoError(t, err)

		asset, err := assetService.UploadImage(fileHeader)

		assert.NoError(t, err)
		assert.NotNil(t, asset)
		assert.Equal(t, "special!@#$%^&*()characters.png", asset.OriginalName)
		// Generated name should be sanitized
		assert.Regexp(t, `^special.*\.png$`, asset.Name)
	})
}

func TestAssetService_GetAssetPath(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	assetService := services.NewAssetService(testDir)

	// Create a test asset first
	fileHeader, err := createMultipartFile("test.png", testImageData, "image/png")
	require.NoError(t, err)
	asset, err := assetService.UploadImage(fileHeader)
	require.NoError(t, err)

	t.Run("returns correct path for existing asset", func(t *testing.T) {
		fullPath, err := assetService.GetAssetPath(asset.Path)

		assert.NoError(t, err)
		expectedPath := filepath.Join(testDir, "assets", "images", asset.Name)
		assert.Equal(t, expectedPath, fullPath)

		// Verify file exists at returned path
		_, err = os.Stat(fullPath)
		assert.NoError(t, err)
	})

	t.Run("returns error for empty path", func(t *testing.T) {
		_, err := assetService.GetAssetPath("")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "path cannot be empty")
	})

	t.Run("returns error for path not starting with slash", func(t *testing.T) {
		_, err := assetService.GetAssetPath("assets/images/test.png")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "path must start with '/'")
	})

	t.Run("prevents directory traversal", func(t *testing.T) {
		_, err := assetService.GetAssetPath("/assets/../../../etc/passwd")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "path cannot contain '.' or '..' segments")
	})

	t.Run("rejects path with invalid characters", func(t *testing.T) {
		_, err := assetService.GetAssetPath("/assets/images/test<script>.png")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "path contains invalid characters")
	})

	t.Run("allows valid asset paths with dots", func(t *testing.T) {
		// This should be allowed since dots are valid in filenames
		validPath := "/assets/images/my.image.with.dots.png"

		// Create the file first
		fullTestPath := filepath.Join(testDir, "assets", "images", "my.image.with.dots.png")
		err := os.MkdirAll(filepath.Dir(fullTestPath), 0755)
		require.NoError(t, err)
		err = os.WriteFile(fullTestPath, testImageData, 0600)
		require.NoError(t, err)

		fullPath, err := assetService.GetAssetPath(validPath)

		assert.NoError(t, err)
		assert.Equal(t, fullTestPath, fullPath)
	})

	t.Run("returns error for non-existent asset", func(t *testing.T) {
		_, err := assetService.GetAssetPath("/assets/images/nonexistent.png")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "asset not found")
	})

	t.Run("prevents access outside data directory", func(t *testing.T) {
		// Create a file outside the data directory
		outsideFile := filepath.Join(filepath.Dir(testDir), "outside.png")
		err := os.WriteFile(outsideFile, testImageData, 0600)
		require.NoError(t, err)
		defer os.Remove(outsideFile)

		// Try to create a symlink or use relative path to access it
		relativePath := "/../../outside.png"
		_, err = assetService.GetAssetPath(relativePath)

		assert.Error(t, err)
		// Should fail either on path validation or directory traversal check
	})
}

func TestAssetService_DeleteAsset(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	assetService := services.NewAssetService(testDir)

	t.Run("deletes existing asset successfully", func(t *testing.T) {
		// Create an asset first
		fileHeader, err := createMultipartFile("todelete.png", testImageData, "image/png")
		require.NoError(t, err)
		asset, err := assetService.UploadImage(fileHeader)
		require.NoError(t, err)

		// Verify file exists
		fullPath := filepath.Join(testDir, "assets", "images", asset.Name)
		_, err = os.Stat(fullPath)
		require.NoError(t, err)

		// Delete the asset
		err = assetService.DeleteAsset(asset.Path)

		assert.NoError(t, err)

		// Verify file is gone
		_, err = os.Stat(fullPath)
		assert.True(t, os.IsNotExist(err))
	})

	t.Run("returns error for non-existent asset", func(t *testing.T) {
		err := assetService.DeleteAsset("/assets/images/nonexistent.png")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "asset not found")
	})

	t.Run("returns error for invalid path", func(t *testing.T) {
		err := assetService.DeleteAsset("/invalid/../path")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "path cannot contain '.' or '..' segments")
	})
}

func TestAssetService_Integration(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	assetService := services.NewAssetService(testDir)

	t.Run("full upload, serve, delete workflow", func(t *testing.T) {
		// Upload
		fileHeader, err := createMultipartFile("workflow.png", testImageData, "image/png")
		require.NoError(t, err)

		asset, err := assetService.UploadImage(fileHeader)
		require.NoError(t, err)
		assert.NotNil(t, asset)

		// Serve (get path)
		fullPath, err := assetService.GetAssetPath(asset.Path)
		assert.NoError(t, err)

		// Verify content
		content, err := os.ReadFile(fullPath)
		assert.NoError(t, err)
		assert.Equal(t, testImageData, content)

		// Delete
		err = assetService.DeleteAsset(asset.Path)
		assert.NoError(t, err)

		// Verify deletion
		_, err = assetService.GetAssetPath(asset.Path)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "asset not found")
	})

	t.Run("multiple uploads with unique names", func(t *testing.T) {
		var assets []*models.Asset

		// Upload 3 files with same name
		for i := 0; i < 3; i++ {
			fileHeader, err := createMultipartFile("multi.png", testImageData, "image/png")
			require.NoError(t, err)

			asset, err := assetService.UploadImage(fileHeader)
			require.NoError(t, err)
			assets = append(assets, asset)
		}

		// All should have unique names
		names := make(map[string]bool)
		for _, asset := range assets {
			assert.False(t, names[asset.Name], "Duplicate asset name: %s", asset.Name)
			names[asset.Name] = true

			// Verify each file exists and can be served
			fullPath, err := assetService.GetAssetPath(asset.Path)
			assert.NoError(t, err)

			content, err := os.ReadFile(fullPath)
			assert.NoError(t, err)
			assert.Equal(t, testImageData, content)
		}
	})
}

func TestAssetService_ErrorCases(t *testing.T) {
	t.Run("invalid data directory", func(t *testing.T) {
		assetService := services.NewAssetService("/invalid/path/that/does/not/exist")

		fileHeader, err := createMultipartFile("test.png", testImageData, "image/png")
		require.NoError(t, err)

		asset, err := assetService.UploadImage(fileHeader)

		assert.Error(t, err)
		assert.Nil(t, asset)
		assert.Contains(t, err.Error(), "failed to create asset directory")
	})

	t.Run("read-only directory", func(t *testing.T) {
		testDir, cleanup := setupTestDir(t)
		defer cleanup()

		// Create assets directory first, then make it read-only
		assetsDir := filepath.Join(testDir, "assets", "images")
		err := os.MkdirAll(assetsDir, 0755)
		require.NoError(t, err)

		err = os.Chmod(assetsDir, 0444)
		require.NoError(t, err)

		// Restore permissions for cleanup
		defer func() {
			os.Chmod(assetsDir, 0755)
		}()

		assetService := services.NewAssetService(testDir)
		fileHeader, err := createMultipartFile("test.png", testImageData, "image/png")
		require.NoError(t, err)

		asset, err := assetService.UploadImage(fileHeader)

		assert.Error(t, err)
		assert.Nil(t, asset)
		assert.Contains(t, err.Error(), "failed to create destination file")
	})
}

func TestAssetService_FileExtensionValidation(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	assetService := services.NewAssetService(testDir)

	allowedExtensions := []string{".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
	for _, ext := range allowedExtensions {
		t.Run("allows "+ext+" extension", func(t *testing.T) {
			filename := "test" + ext
			contentType := "image/png" // Simplified for test
			if ext == ".svg" {
				contentType = "image/svg+xml"
			}

			fileHeader, err := createMultipartFile(filename, testImageData, contentType)
			require.NoError(t, err)

			asset, err := assetService.UploadImage(fileHeader)

			assert.NoError(t, err)
			assert.NotNil(t, asset)
			assert.True(t, strings.HasSuffix(asset.Name, ext))
		})
	}

	forbiddenExtensions := []string{".txt", ".pdf", ".doc", ".exe", ".zip"}
	for _, ext := range forbiddenExtensions {
		t.Run("rejects "+ext+" extension", func(t *testing.T) {
			filename := "test" + ext

			fileHeader, err := createMultipartFile(filename, testImageData, "image/png")
			require.NoError(t, err)

			asset, err := assetService.UploadImage(fileHeader)

			assert.Error(t, err)
			assert.Nil(t, asset)
			assert.Contains(t, err.Error(), "unsupported file extension")
		})
	}
}

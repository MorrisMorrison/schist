package services

import (
	"archive/zip"
	"bytes"
	stderrors "errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/utils"
)

// Bulk import and export (markdown / zip) operations for documents and folders.
// Split out of document_service.go to keep that file focused on CRUD.

func (d *DocumentService) ImportDocuments(
	files []*multipart.FileHeader,
	options *models.ImportOptions,
) (*models.ImportResult, error) {
	result := &models.ImportResult{
		Success:    make([]models.ImportedDocument, 0),
		Failed:     make([]models.ImportError, 0),
		Skipped:    make([]models.ImportedDocument, 0),
		TotalFiles: len(files),
	}

	if options.TargetPath == "" {
		options.TargetPath = "/"
	}

	for _, fileHeader := range files {
		err := d.importSingleFile(fileHeader, options, result)
		if err != nil {
			result.Failed = append(result.Failed, models.ImportError{
				OriginalName: fileHeader.Filename,
				Error:        importErrorMessage(fileHeader.Filename, err),
			})
			result.FailedCount++
		}
	}

	result.ImportedCount = len(result.Success)
	result.SkippedCount = len(result.Skipped)

	return result, nil
}

// errUnsupportedImportType is a client-facing import failure reason.
var errUnsupportedImportType = errors.NewValidationError("only markdown files (.md) are supported")

// importErrorMessage returns the per-file failure reason sent to the client.
// Typed API errors carry a client-safe message; anything else is an internal
// failure whose detail (file system paths etc.) is logged, never returned.
func importErrorMessage(filename string, err error) string {
	var apiErr *errors.APIError
	if stderrors.As(err, &apiErr) && apiErr.HTTPStatus < http.StatusInternalServerError {
		return apiErr.Message
	}
	log.Printf("ERROR: import of %q failed: %v", filename, err)
	return "failed to import file"
}

func (d *DocumentService) importSingleFile(
	fileHeader *multipart.FileHeader,
	options *models.ImportOptions,
	result *models.ImportResult,
) error {
	if !strings.HasSuffix(strings.ToLower(fileHeader.Filename), ".md") {
		return errUnsupportedImportType
	}

	file, err := fileHeader.Open()
	if err != nil {
		return fmt.Errorf("failed to open uploaded file: %w", err)
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		return fmt.Errorf("failed to read file content: %w", err)
	}

	processedContent := d.processImportedMarkdown(string(content))

	title := d.extractTitleFromContent(processedContent, fileHeader.Filename)
	slug := utils.GenerateSlug(title)

	pathResult, err := d.determineFinalPath(slug, options.TargetPath, options.OverwriteMode)
	if err != nil {
		return err
	}

	// Check if file should be skipped
	if pathResult.shouldSkip {
		result.Skipped = append(result.Skipped, models.ImportedDocument{
			OriginalName: fileHeader.Filename,
			FinalPath:    pathResult.finalPath,
			Title:        title,
		})
		return nil
	}

	now := time.Now()
	metadata := &models.DocumentMetaData{
		Slug:    slug,
		Title:   title,
		Path:    pathResult.finalPath,
		Created: now,
		Updated: now,
		Tags:    []string{},
	}

	document := &models.Document{
		MetaData: metadata,
		Content:  processedContent,
	}
	if err := d.createDocument(document, pathResult.overwrite); err != nil {
		return err
	}

	result.Success = append(result.Success, models.ImportedDocument{
		OriginalName: fileHeader.Filename,
		FinalPath:    pathResult.finalPath,
		Title:        title,
	})

	return nil
}

func (d *DocumentService) processImportedMarkdown(content string) string {
	// Remove YAML frontmatter (Obsidian and other systems)
	frontmatterRegex := regexp.MustCompile(`^---\s*\n.*?\n---\s*\n`)
	content = frontmatterRegex.ReplaceAllString(content, "")

	return strings.TrimSpace(content)
}

func (d *DocumentService) extractTitleFromContent(content, filename string) string {
	lines := strings.Split(content, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			title := strings.TrimSpace(strings.TrimPrefix(line, "# "))
			if title != "" {
				return title
			}
		}
	}

	return strings.TrimSuffix(filename, filepath.Ext(filename))
}

func (d *DocumentService) determineFinalPath(slug, targetPath, overwriteMode string) (pathResult, error) {
	targetPath = strings.Trim(targetPath, "/")
	if targetPath != "" {
		targetPath = "/" + targetPath
	}

	basePath := targetPath + "/" + slug
	if err := utils.ValidatePath(basePath); err != nil {
		return pathResult{}, errors.NewInvalidPathError(basePath).WithCause(err)
	}

	finalPath := basePath
	for counter := 1; ; counter++ {
		// Check the file itself rather than whether it parses: an existing note
		// with broken front matter must never be treated as a free slot.
		exists, err := d.documentFileExists(finalPath)
		if err != nil {
			return pathResult{}, err
		}
		if !exists {
			return pathResult{finalPath: finalPath}, nil
		}

		switch overwriteMode {
		case "overwrite":
			return pathResult{finalPath: finalPath, overwrite: true}, nil
		case "skip":
			return pathResult{finalPath: finalPath, shouldSkip: true}, nil
		default: // "rename" or empty
			finalPath = fmt.Sprintf("%s-%d", basePath, counter)
		}
	}
}

func (d *DocumentService) ExportDocument(path string) ([]byte, string, error) {
	document, err := d.GetDocumentByPath(path)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get document: %w", err)
	}

	content := fmt.Sprintf("# %s\n\n%s", document.MetaData.Title, document.Content)

	filename := filepath.Base(path)
	if !strings.HasSuffix(filename, ".md") {
		filename += ".md"
	}

	return []byte(content), filename, nil
}

func (d *DocumentService) ExportFolder(folderPath string) ([]byte, string, error) {
	normalizedPath := folderPath
	if !strings.HasPrefix(normalizedPath, "/") {
		normalizedPath = "/" + normalizedPath
	}

	buf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(buf)

	err := d.addFolderToZip(zipWriter, normalizedPath, "")
	if err != nil {
		zipWriter.Close()
		return nil, "", fmt.Errorf("failed to create zip: %w", err)
	}

	err = zipWriter.Close()
	if err != nil {
		return nil, "", fmt.Errorf("failed to close zip: %w", err)
	}

	folderName := filepath.Base(folderPath)
	if folderName == "/" || folderName == "." {
		folderName = "documents"
	}
	filename := fmt.Sprintf("%s.zip", folderName)

	return buf.Bytes(), filename, nil
}

func (d *DocumentService) ExportAll() ([]byte, string, error) {
	buf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(buf)

	err := d.addFolderToZip(zipWriter, "/", "")
	if err != nil {
		zipWriter.Close()
		return nil, "", fmt.Errorf("failed to create zip: %w", err)
	}

	err = zipWriter.Close()
	if err != nil {
		return nil, "", fmt.Errorf("failed to close zip: %w", err)
	}

	filename := "all-documents.zip"
	return buf.Bytes(), filename, nil
}

func (d *DocumentService) addFolderToZip(
	zipWriter *zip.Writer,
	folderPath string,
	zipPrefix string,
) error {
	allDocuments, err := d.ListDocuments()
	if err != nil {
		return fmt.Errorf("failed to list documents: %w", err)
	}

	for _, doc := range allDocuments {
		docFolder := filepath.Dir(doc.MetaData.Path)
		if docFolder == folderPath {
			zipPath := filepath.Join(zipPrefix, doc.MetaData.Title+".md")

			fileWriter, err := zipWriter.Create(zipPath)
			if err != nil {
				return fmt.Errorf("failed to create file in zip: %w", err)
			}

			content := fmt.Sprintf("# %s\n\n%s", doc.MetaData.Title, doc.Content)
			_, err = fileWriter.Write([]byte(content))
			if err != nil {
				return fmt.Errorf("failed to write file content: %w", err)
			}
		}
	}

	folder, err := d.GetFolder(folderPath)
	if err != nil {
		return fmt.Errorf("failed to get folder %s: %w", folderPath, err)
	}

	for _, subfolder := range folder.SubFolders {
		subZipPrefix := filepath.Join(zipPrefix, subfolder.Name)
		err := d.addFolderToZip(zipWriter, subfolder.Path, subZipPrefix)
		if err != nil {
			return err
		}
	}

	return nil
}

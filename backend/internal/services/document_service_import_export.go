package services

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"path/filepath"
	"regexp"
	"strings"
	"time"

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
				Error:        err.Error(),
			})
			result.FailedCount++
		}
	}

	result.ImportedCount = len(result.Success)
	result.SkippedCount = len(result.Skipped)

	return result, nil
}

func (d *DocumentService) importSingleFile(
	fileHeader *multipart.FileHeader,
	options *models.ImportOptions,
	result *models.ImportResult,
) error {
	if !strings.HasSuffix(strings.ToLower(fileHeader.Filename), ".md") {
		return fmt.Errorf("only markdown files (.md) are supported")
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

	pathResult := d.determineFinalPath(slug, options.TargetPath, options.OverwriteMode)

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
	err = d.CreateDocument(document)
	if err != nil {
		return fmt.Errorf("failed to create document: %w", err)
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

func (d *DocumentService) determineFinalPath(slug, targetPath, overwriteMode string) pathResult {
	if targetPath == "" || targetPath == "/" {
		targetPath = ""
	} else {
		targetPath = strings.Trim(targetPath, "/")
		if targetPath != "" {
			targetPath = "/" + targetPath
		}
	}

	basePath := targetPath + "/" + slug
	finalPath := basePath

	counter := 1
	for {
		_, err := d.GetDocumentByPath(finalPath)
		if err != nil {
			// Document doesn't exist, we can use this path
			break
		}

		// Document exists at this path
		switch overwriteMode {
		case "overwrite":
			// Use the path as-is, will overwrite existing document
			break
		case "skip":
			// Document exists and should be skipped
			return pathResult{
				finalPath:  finalPath,
				shouldSkip: true,
			}
		default: // "rename" or empty
			// Generate new path with counter
			finalPath = fmt.Sprintf("%s-%d", basePath, counter)
			counter++
			continue
		}
		break
	}

	return pathResult{
		finalPath:  finalPath,
		shouldSkip: false,
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

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
	slashpath "path"
	"strings"

	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/utils"
)

// Bulk import and export (markdown / zip) operations for documents and folders.
// Split out of document_service.go to keep that file focused on CRUD.

// Import limits: a whole vault fits, a zip bomb doesn't.
const (
	maxImportFiles     = 5000
	maxImportFileBytes = 10 << 20  // one markdown file
	maxImportZipBytes  = 200 << 20 // uncompressed content of one zip
)

// ImportDocuments imports uploaded files into one folder (the classic
// multi-file upload). See ImportUploads for folders and zips.
func (d *DocumentService) ImportDocuments(
	files []*multipart.FileHeader,
	options *models.ImportOptions,
) (*models.ImportResult, error) {
	return d.ImportUploads(files, nil, options)
}

// ImportUploads imports uploaded files. relPaths, when given, holds each
// file's path inside an uploaded folder ("homelab/devices/vps.md"), so the
// folder structure is kept. A .zip upload is unpacked the same way.
func (d *DocumentService) ImportUploads(
	files []*multipart.FileHeader,
	relPaths []string,
	options *models.ImportOptions,
) (*models.ImportResult, error) {
	var importFiles []models.ImportFile
	var failed []models.ImportError
	for i, header := range files {
		name := header.Filename
		if i < len(relPaths) && strings.TrimSpace(relPaths[i]) != "" {
			name = relPaths[i]
		}
		data, err := readUpload(header)
		if err != nil {
			failed = append(failed, models.ImportError{OriginalName: name, Error: importErrorMessage(name, err)})
			continue
		}
		if strings.EqualFold(slashpath.Ext(name), ".zip") {
			entries, err := unpackImportZip(data)
			if err != nil {
				failed = append(failed, models.ImportError{OriginalName: name, Error: importErrorMessage(name, err)})
				continue
			}
			importFiles = append(importFiles, entries...)
			continue
		}
		importFiles = append(importFiles, models.ImportFile{Path: name, Content: data})
	}

	result, err := d.ImportFiles(importFiles, options)
	if err != nil {
		return nil, err
	}
	if len(failed) > 0 {
		result.Failed = append(failed, result.Failed...)
		result.FailedCount = len(result.Failed)
		result.TotalFiles += len(failed)
	}
	return result, nil
}

func readUpload(header *multipart.FileHeader) ([]byte, error) {
	if header.Size > maxImportZipBytes {
		return nil, errors.NewValidationError("file is too large")
	}
	file, err := header.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to open uploaded file: %w", err)
	}
	defer file.Close()
	return io.ReadAll(io.LimitReader(file, maxImportZipBytes+1))
}

// unpackImportZip returns the zip's files with their paths inside the zip.
// Sizes are checked as entries are read, not trusted from the header.
func unpackImportZip(data []byte) ([]models.ImportFile, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, errors.NewValidationError("not a valid zip file")
	}
	if len(reader.File) > maxImportFiles {
		return nil, errors.NewValidationError(fmt.Sprintf("the zip has more than %d files", maxImportFiles))
	}

	var files []models.ImportFile
	var total int64
	for _, entry := range reader.File {
		if entry.FileInfo().IsDir() {
			continue
		}
		rc, err := entry.Open()
		if err != nil {
			return nil, errors.NewValidationError("the zip could not be read")
		}
		content, err := io.ReadAll(io.LimitReader(rc, maxImportFileBytes+1))
		rc.Close()
		if err != nil {
			return nil, errors.NewValidationError("the zip could not be read")
		}
		total += int64(len(content))
		if total > maxImportZipBytes {
			return nil, errors.NewValidationError("the zip is too large to import")
		}
		files = append(files, models.ImportFile{Path: entry.Name, Content: content})
	}
	return files, nil
}

// ImportFiles imports markdown files given by their path inside the import
// (folders are kept) and content. Obsidian syntax is converted, and links
// between the imported files are rewritten so they resolve. Files that can't
// be imported are reported per file; only an unexpected failure returns an
// error.
func (d *DocumentService) ImportFiles(files []models.ImportFile, options *models.ImportOptions) (*models.ImportResult, error) {
	result := &models.ImportResult{
		Success:    make([]models.ImportedDocument, 0),
		Failed:     make([]models.ImportError, 0),
		Skipped:    make([]models.ImportedDocument, 0),
		TotalFiles: len(files),
	}
	target, err := importTargetFolder(options.TargetPath)
	if err != nil {
		return nil, err
	}
	options.TargetPath = target
	if len(files) > maxImportFiles {
		return nil, errors.NewValidationError(fmt.Sprintf("an import can have at most %d files", maxImportFiles))
	}

	// Pass 1: convert every file and decide where it goes.
	type pending struct {
		relPath string
		note    importedNote
		target  pathResult
	}
	var queue []pending
	links := importLinkIndex{}
	wikiLinks, err := d.importWikiLinkIndex(options.TargetPath)
	if err != nil {
		return nil, err
	}
	taken := map[string]bool{}
	for _, file := range files {
		relPath, err := cleanImportPath(file.Path)
		if err != nil {
			result.Failed = append(result.Failed, models.ImportError{OriginalName: file.Path, Error: importErrorMessage(file.Path, err)})
			continue
		}
		if reason := importSkipReason(relPath); reason != "" {
			result.Skipped = append(result.Skipped, models.ImportedDocument{OriginalName: relPath, Notes: []string{reason}})
			continue
		}
		if !strings.EqualFold(slashpath.Ext(relPath), ".md") {
			if strings.Contains(relPath, "/") {
				result.Skipped = append(result.Skipped, models.ImportedDocument{OriginalName: relPath, Notes: []string{"not a markdown file"}})
			} else {
				result.Failed = append(result.Failed, models.ImportError{OriginalName: relPath, Error: errUnsupportedImportType.Message})
			}
			continue
		}
		if len(file.Content) > maxImportFileBytes {
			result.Failed = append(result.Failed, models.ImportError{OriginalName: relPath, Error: "file is too large"})
			continue
		}

		note := parseImportedMarkdown(string(file.Content), relPath)
		folder := strings.Trim(strings.Trim(options.TargetPath, "/")+"/"+importFolderPath(slashpath.Dir(relPath)), "/")
		target, err := d.determineFinalPath(importPageSlug(relPath, note.title), folder, options.OverwriteMode, taken)
		if err != nil {
			result.Failed = append(result.Failed, models.ImportError{OriginalName: relPath, Error: importErrorMessage(relPath, err)})
			continue
		}
		taken[target.finalPath] = true
		if !target.shouldSkip {
			// A skipped file keeps the page already there; links find that
			// page through the wiki index.
			links.add(relPath, note.title, target.finalPath)
		}
		queue = append(queue, pending{relPath: relPath, note: note, target: target})
	}
	markDuplicateTitles(links, wikiLinks)

	// Pass 2: rewrite links against the whole import, then write.
	var written []string
	for _, p := range queue {
		imported := models.ImportedDocument{OriginalName: p.relPath, FinalPath: p.target.finalPath, Title: p.note.title}
		body, unresolved := rewriteImportLinks(p.note.body, slashpath.Dir(p.relPath), p.target.finalPath, links, wikiLinks)
		imported.Notes = p.note.notes
		if unresolved > 0 {
			imported.Notes = append(imported.Notes, plural(unresolved, "link not found in this import or the wiki (kept by name)"))
		}
		if p.target.shouldSkip {
			imported.Notes = append(imported.Notes, "a document already exists here")
			result.Skipped = append(result.Skipped, imported)
			continue
		}

		document := &models.Document{
			MetaData: &models.DocumentMetaData{
				Slug:       slashpath.Base(p.target.finalPath),
				Title:      p.note.title,
				Path:       p.target.finalPath,
				Tags:       p.note.tags,
				Created:    p.note.created,
				Updated:    p.note.updated,
				Properties: p.note.properties,
			},
			Content: body,
		}
		if document.MetaData.Tags == nil {
			document.MetaData.Tags = []string{}
		}
		if err := d.createDocument(document, createOptions{overwrite: p.target.overwrite, keepDates: true, noCommit: true}); err != nil {
			result.Failed = append(result.Failed, models.ImportError{OriginalName: p.relPath, Error: importErrorMessage(p.relPath, err)})
			continue
		}
		result.Success = append(result.Success, imported)
		written = append(written, p.target.finalPath)
	}

	// One commit for the whole import: a commit per page made importing a
	// vault take seconds per note.
	if len(written) > 0 {
		message := fmt.Sprintf("Import %d documents", len(written))
		if len(written) == 1 {
			message = "Import document: " + written[0]
		}
		if err := d.commitDocumentChange(message, written...); err != nil {
			log.Printf("Warning: import written but not committed: %v", err)
		}
	}

	result.ImportedCount = len(result.Success)
	result.SkippedCount = len(result.Skipped)
	result.FailedCount = len(result.Failed)
	return result, nil
}

// importWikiLinkIndex indexes the pages already in the wiki, so links to notes
// outside the import (an earlier batch, a page written in Schist) resolve.
func (d *DocumentService) importWikiLinkIndex(targetPath string) (importLinkIndex, error) {
	documents, err := d.ListDocuments()
	if err != nil {
		return nil, fmt.Errorf("failed to list documents for import links: %w", err)
	}
	idx := importLinkIndex{}
	for _, document := range documents {
		idx.addPage(document.MetaData.Path, document.MetaData.Title, targetPath)
	}
	return idx, nil
}

// importTargetFolder cleans the folder an import goes into, which may not
// exist yet: names that are valid paths stay as they are, others become slugs
// ("My Notes" → "my-notes"), and a folder that climbs out is refused.
func importTargetFolder(target string) (string, error) {
	var parts []string
	for _, seg := range strings.Split(strings.ReplaceAll(target, "\\", "/"), "/") {
		seg = strings.TrimSpace(seg)
		switch {
		case seg == "" || seg == ".":
			continue
		case seg == "..":
			return "", errors.NewValidationError("invalid target folder")
		case utils.ValidatePath("/"+seg) != nil:
			seg = slugifySegment(seg)
		}
		parts = append(parts, seg)
	}
	return "/" + strings.Join(parts, "/"), nil
}

// cleanImportPath turns an upload or zip entry name into a clean relative
// slash path, refusing anything that climbs out of the import.
func cleanImportPath(name string) (string, error) {
	p := strings.ReplaceAll(strings.TrimSpace(name), "\\", "/")
	for _, seg := range strings.Split(p, "/") {
		if seg == ".." {
			return "", errors.NewValidationError("invalid file path")
		}
	}
	p = strings.TrimPrefix(slashpath.Clean("/"+p), "/")
	if p == "" || p == "." {
		return "", errors.NewValidationError("invalid file path")
	}
	return p, nil
}

func slugifySegment(s string) string { return utils.GenerateSlug(s) }

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

// determineFinalPath picks the path for an imported note. taken holds paths
// already given to earlier files of the same import, which are always
// renamed around (two files must never land on the same document).
func (d *DocumentService) determineFinalPath(slug, targetPath, overwriteMode string, taken map[string]bool) (pathResult, error) {
	targetPath = strings.Trim(targetPath, "/")
	if targetPath != "" {
		targetPath = "/" + targetPath
	}

	basePath := targetPath + "/" + slug
	if err := validatePath(basePath); err != nil {
		return pathResult{}, err
	}

	finalPath := basePath
	for counter := 1; ; counter++ {
		// Check the file itself rather than whether it parses: an existing note
		// with broken front matter must never be treated as a free slot.
		if taken[finalPath] {
			finalPath = fmt.Sprintf("%s-%d", basePath, counter)
			continue
		}
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
		return nil, "", err
	}

	filename := slashpath.Base(path)
	if !strings.HasSuffix(filename, ".md") {
		filename += ".md"
	}

	return exportMarkdown(document), filename, nil
}

// exportMarkdown is a document as exported: its title as a heading, then the
// content.
func exportMarkdown(document *models.Document) []byte {
	return []byte(fmt.Sprintf("# %s\n\n%s", document.MetaData.Title, document.Content))
}

func (d *DocumentService) ExportFolder(folderPath string) ([]byte, string, error) {
	normalizedPath := utils.NormalizePath(folderPath)
	if err := utils.ValidatePath(normalizedPath); err != nil {
		return nil, "", errors.NewInvalidPathError(folderPath).WithCause(err)
	}

	content, err := d.zipFolder(normalizedPath)
	if err != nil {
		return nil, "", err
	}

	folderName := slashpath.Base(normalizedPath)
	if folderName == "/" || folderName == "." {
		folderName = "documents"
	}
	filename := fmt.Sprintf("%s.zip", folderName)

	return content, filename, nil
}

func (d *DocumentService) ExportAll() ([]byte, string, error) {
	content, err := d.zipFolder("/")
	if err != nil {
		return nil, "", err
	}
	return content, "all-documents.zip", nil
}

// zipFolder builds a zip of the documents in folderPath and its subfolders.
func (d *DocumentService) zipFolder(folderPath string) ([]byte, error) {
	buf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(buf)

	if err := d.addFolderToZip(zipWriter, folderPath, ""); err != nil {
		zipWriter.Close()
		return nil, fmt.Errorf("failed to create zip: %w", err)
	}

	if err := zipWriter.Close(); err != nil {
		return nil, fmt.Errorf("failed to close zip: %w", err)
	}

	return buf.Bytes(), nil
}

// zipSafeName turns a document title into a single, non-traversing zip entry
// name component.
func zipSafeName(title string) string {
	name := strings.NewReplacer("/", "-", "\\", "-").Replace(title)
	name = strings.Trim(strings.ReplaceAll(name, "..", ""), " .-")
	if name == "" {
		return "untitled"
	}
	return name
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
		docFolder := slashpath.Dir(doc.MetaData.Path)
		if docFolder == folderPath {
			// Zip entry names always use forward slashes, and the title is
			// user-controlled, so it must not introduce path segments.
			zipPath := slashpath.Join(zipPrefix, zipSafeName(doc.MetaData.Title)+".md")

			fileWriter, err := zipWriter.Create(zipPath)
			if err != nil {
				return fmt.Errorf("failed to create file in zip: %w", err)
			}

			_, err = fileWriter.Write(exportMarkdown(doc))
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
		subZipPrefix := slashpath.Join(zipPrefix, subfolder.Name)
		err := d.addFolderToZip(zipWriter, subfolder.Path, subZipPrefix)
		if err != nil {
			return err
		}
	}

	return nil
}

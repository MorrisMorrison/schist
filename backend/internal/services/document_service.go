package services

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	// Logical document paths are always slash-separated, independent of the
	// host OS; filepath is only for real filesystem paths.
	slashpath "path"
	"strings"
	"time"

	"github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/serializer"
	"github.com/MorrisMorrison/schist/internal/utils"
)

const MARKDOWN_FILE_ENDING = ".md"

type pathResult struct {
	finalPath  string
	shouldSkip bool
	overwrite  bool
}

type DocumentService struct {
	dataDir       string
	gitService    *GitService
	ignoreService *IgnoreService
}

// validatePath applies the shared path rules (utils.ValidatePath) to a
// user-supplied logical path and reports a violation as a typed InvalidPath
// error (400).
func validatePath(path string) error {
	if err := utils.ValidatePath(path); err != nil {
		return errors.NewInvalidPathError(path).WithCause(err)
	}
	return nil
}

func NewDocumentService(dataDir string, gitService *GitService, ignoreService *IgnoreService) *DocumentService {
	return &DocumentService{
		dataDir:       dataDir,
		gitService:    gitService,
		ignoreService: ignoreService,
	}
}

func (d *DocumentService) Search(query string) ([]*models.Document, error) {
	documents, err := d.ListDocuments()
	if err != nil {
		return nil, err
	}

	textQuery, tagFilters := d.parseSearchQuery(query)

	var filtered []*models.Document
	lowerTextQuery := strings.ToLower(textQuery)

	for _, document := range documents {
		if d.ignoreService.ShouldIgnore(document.MetaData.Path) {
			continue
		}

		textMatch := textQuery == "" || strings.Contains(strings.ToLower(document.MetaData.Title), lowerTextQuery)

		tagMatch := d.matchesTags(document, tagFilters)

		if textMatch && tagMatch {
			filtered = append(filtered, document)
		}
	}

	return filtered, nil
}

// Supports syntax like: "authentication tag:security tag:golang"
func (d *DocumentService) parseSearchQuery(query string) (string, []string) {
	var textParts []string
	var tagFilters []string

	// Split query into words
	words := strings.Fields(query)

	for _, word := range words {
		if strings.HasPrefix(strings.ToLower(word), "tag:") {
			// Extract tag name (case-insensitive matching)
			tagName := strings.TrimPrefix(strings.ToLower(word), "tag:")
			if tagName != "" {
				tagFilters = append(tagFilters, tagName)
			}
		} else {
			// Regular text search word
			textParts = append(textParts, word)
		}
	}

	textQuery := strings.Join(textParts, " ")
	return textQuery, tagFilters
}

func (d *DocumentService) matchesTags(document *models.Document, requiredTags []string) bool {
	if len(requiredTags) == 0 {
		return true
	}

	if document.MetaData.Tags == nil {
		return false
	}

	for _, requiredTag := range requiredTags {
		requiredLower := strings.ToLower(requiredTag)
		found := false

		for _, documentTag := range document.MetaData.Tags {
			if strings.Contains(strings.ToLower(documentTag), requiredLower) {
				found = true
				break
			}
		}

		if !found {
			return false
		}
	}

	return true
}

func (d *DocumentService) GetAllTags() (map[string]int, error) {
	documents, err := d.ListDocuments()
	if err != nil {
		return nil, err
	}

	tagCounts := make(map[string]int)

	for _, document := range documents {
		if d.ignoreService.ShouldIgnore(document.MetaData.Path) {
			continue
		}

		if document.MetaData.Tags != nil {
			for _, tag := range document.MetaData.Tags {
				tagCounts[tag]++
			}
		}
	}

	return tagCounts, nil
}

// CreateDocument writes a new document. It refuses to replace an existing
// document at the same path (AlreadyExists) so a stale client-side existence
// check or a racing request can never silently overwrite a note.
func (d *DocumentService) CreateDocument(document *models.Document) error {
	return d.createDocument(document, false)
}

func (d *DocumentService) createDocument(document *models.Document, overwrite bool) error {
	if document.MetaData == nil {
		return errors.NewMissingRequiredFieldError("metaData")
	}

	if document.MetaData.Slug == "" {
		document.MetaData.Slug = utils.GenerateSlug(document.MetaData.Title)
	}

	if document.MetaData.Path == "" {
		document.MetaData.Path = "/" + document.MetaData.Slug
	}

	if err := validatePath(document.MetaData.Path); err != nil {
		return err
	}

	if !overwrite {
		exists, err := d.documentFileExists(document.MetaData.Path)
		if err != nil {
			return err
		}
		if exists {
			return errors.NewAlreadyExistsError("document", document.MetaData.Path)
		}
	}

	now := time.Now()
	document.MetaData.Created = now
	document.MetaData.Updated = now

	if err := d.saveDocument(document); err != nil {
		return err
	}

	return d.commitDocumentChange(fmt.Sprintf("Create document: %s", document.MetaData.Path), document.MetaData.Path)
}

// documentFileExists reports whether a document file exists for the logical
// path. Any stat failure other than "not exist" is returned as an error so
// callers never treat an unreadable file as free to overwrite.
func (d *DocumentService) documentFileExists(documentPath string) (bool, error) {
	_, err := os.Stat(d.buildFilePathFromPath(documentPath))
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, fmt.Errorf("failed to check document at path %s: %w", documentPath, err)
}

func (d *DocumentService) UpdateDocumentWithSaveType(document *models.Document, saveType string) error {
	if document.MetaData == nil {
		return errors.NewMissingRequiredFieldError("metaData")
	}
	if err := validatePath(document.MetaData.Path); err != nil {
		return err
	}

	// Created is server-owned: keep the stored value rather than trusting the
	// client, which typically omits it (zero time) on update.
	now := time.Now()
	if existing, err := d.GetDocumentByPath(document.MetaData.Path); err == nil && !existing.MetaData.Created.IsZero() {
		document.MetaData.Created = existing.MetaData.Created
	} else if document.MetaData.Created.IsZero() {
		document.MetaData.Created = now
	}
	document.MetaData.Updated = now

	if err := d.saveDocument(document); err != nil {
		return err
	}

	// Only commit to git for manual saves, skip auto-saves to prevent version pollution
	if saveType == "manual" {
		return d.commitDocumentChange(fmt.Sprintf("Update document: %s", document.MetaData.Path), document.MetaData.Path)
	}

	return nil
}

func (d *DocumentService) DeleteDocument(path string) error {
	documentPath := utils.EnsureLeadingSlash(strings.TrimSuffix(path, MARKDOWN_FILE_ENDING))
	if err := validatePath(documentPath); err != nil {
		return err
	}

	filePath := d.buildFilePathFromPath(documentPath)

	if err := os.Remove(filePath); err != nil {
		if os.IsNotExist(err) {
			return errors.NewNotFoundError("document", documentPath)
		}
		return fmt.Errorf("failed to delete document file: %w", err)
	}

	return d.commitDocumentChange(fmt.Sprintf("Delete document: %s", documentPath), documentPath)
}

func (d *DocumentService) ListDocuments() ([]*models.Document, error) {
	var documents []*models.Document

	err := filepath.WalkDir(d.dataDir, func(path string, dirEntry os.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if dirEntry.IsDir() {
			if d.ignoreService.ShouldIgnoreFile(path) {
				return filepath.SkipDir
			}
			return nil
		}

		if !strings.HasSuffix(dirEntry.Name(), MARKDOWN_FILE_ENDING) {
			return nil
		}

		if d.ignoreService.ShouldIgnoreFile(path) {
			return nil
		}

		logicalPath, err := d.logicalPath(path)
		if err != nil {
			return err
		}
		logicalPath = strings.TrimSuffix(logicalPath, MARKDOWN_FILE_ENDING)

		document, err := d.GetDocumentByPath(logicalPath)
		if err != nil {
			log.Printf("Skipping file %s: %v", logicalPath, err)
			return nil
		}

		documents = append(documents, document)
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to walk directory tree: %w", err)
	}

	return documents, nil
}

// logicalPath maps a file or folder under the data dir to its slash-separated
// logical path ("/projects/a.md").
func (d *DocumentService) logicalPath(fsPath string) (string, error) {
	relPath, err := filepath.Rel(d.dataDir, fsPath)
	if err != nil {
		return "", fmt.Errorf("failed to get relative path: %w", err)
	}
	return "/" + filepath.ToSlash(relPath), nil
}

func (d *DocumentService) buildFilePathFromPath(path string) string {
	slug := utils.ExtractSlugFromPath(path)

	fullPath := utils.BuildFilePath(d.dataDir, path)

	dir := filepath.Dir(fullPath)
	return filepath.Join(dir, slug+MARKDOWN_FILE_ENDING)
}

func (d *DocumentService) saveDocument(document *models.Document) error {
	content, err := serializer.SerializeDocument(document)
	if err != nil {
		return fmt.Errorf("failed to serialize document: %w", err)
	}

	fileName := d.buildFilePathFromPath(document.MetaData.Path)

	dir := filepath.Dir(fileName)
	fileMode := os.FileMode(0755)
	if err := os.MkdirAll(dir, fileMode); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", dir, err)
	}

	// Write atomically so a crash or full disk mid-save can never leave a
	// truncated note behind. 0644 = owner read/write, others read.
	if err := utils.WriteFileAtomic(fileName, content, 0644); err != nil {
		return fmt.Errorf("failed to write document file: %w", err)
	}
	return nil
}

func (d *DocumentService) GetDocumentByPath(path string) (*models.Document, error) {
	if err := validatePath(path); err != nil {
		return nil, err
	}

	filePath := d.buildFilePathFromPath(path)

	fileContent, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, errors.NewNotFoundError("document", path)
		}
		return nil, fmt.Errorf("could not read document at path %s: %w", path, err)
	}

	document, err := serializer.DeserializeDocument(fileContent)
	if err != nil {
		return nil, fmt.Errorf("could not deserialize document at path %s: %w", path, err)
	}

	return document, nil
}

func (d *DocumentService) MoveDocument(oldPath, newPath string) error {
	if err := validatePath(oldPath); err != nil {
		return err
	}
	if err := validatePath(newPath); err != nil {
		return err
	}

	normalizedOldPath := utils.NormalizePath(oldPath)
	normalizedNewPath := utils.NormalizePath(newPath)

	if normalizedOldPath == normalizedNewPath {
		return nil
	}

	document, err := d.GetDocumentByPath(oldPath)
	if err != nil {
		// GetDocumentByPath returns a typed NotFound for a missing source doc
		// (identifier already == oldPath); propagate it as-is. Any other failure
		// is a genuine internal error.
		if errors.IsAPIError(err) {
			return err
		}
		return fmt.Errorf("could not read document from old path: %w", err)
	}

	// Never replace another document. On a case-insensitive filesystem a
	// case-only rename also lands here: the "target" is the source file itself,
	// and the old save-then-remove sequence would have deleted the note.
	exists, err := d.documentFileExists(normalizedNewPath)
	if err != nil {
		return err
	}
	if exists {
		return errors.NewAlreadyExistsError("document", normalizedNewPath)
	}

	document.MetaData.Path = normalizedNewPath
	document.MetaData.Slug = utils.ExtractSlugFromPath(normalizedNewPath)
	document.MetaData.Updated = time.Now()

	if err := d.saveDocument(document); err != nil {
		return fmt.Errorf("could not save document to new path: %w", err)
	}

	oldFilePath := d.buildFilePathFromPath(normalizedOldPath)
	if err := os.Remove(oldFilePath); err != nil {
		return fmt.Errorf("could not remove old file: %w", err)
	}

	// Commit both paths so the old file's removal is recorded too.
	return d.commitDocumentChange(
		fmt.Sprintf("Move document: %s -> %s", normalizedOldPath, normalizedNewPath),
		normalizedNewPath, normalizedOldPath,
	)
}

func (d *DocumentService) GetFolder(path string) (*models.Folder, error) {
	if err := validatePath(path); err != nil {
		return nil, err
	}

	if path == "/" {
		return d.getRootFolder()
	}

	return d.buildFolderFromPath(path)
}

func (d *DocumentService) buildFolderFromPath(path string) (*models.Folder, error) {
	folderPath := utils.BuildFilePath(d.dataDir, path)
	info, err := d.validateFolderPath(folderPath, path)
	if err != nil {
		return nil, err
	}

	folder := d.createFolderStruct(path, info)
	return d.populateFolderContents(folder, folderPath)
}

func (d *DocumentService) validateFolderPath(folderPath, path string) (os.FileInfo, error) {
	info, err := os.Stat(folderPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, errors.NewNotFoundError("folder", path)
		}
		return nil, fmt.Errorf("failed to access folder at path %s: %w", path, err)
	}

	if !info.IsDir() {
		return nil, errors.NewValidationError(fmt.Sprintf("path %s is not a directory", path))
	}

	return info, nil
}

func (d *DocumentService) createFolderStruct(path string, info os.FileInfo) *models.Folder {
	folderName := slashpath.Base(path)
	if folderName == "." || folderName == "/" {
		folderName = "Root"
	}

	return &models.Folder{
		Name:          folderName,
		Path:          path,
		Created:       info.ModTime(),
		DocumentCount: 0,
		SubFolders:    []*models.Folder{},
	}
}

func (d *DocumentService) populateFolderContents(folder *models.Folder, folderPath string) (*models.Folder, error) {
	entries, err := os.ReadDir(folderPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read folder contents at path %s: %w", folder.Path, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			entryPath := slashpath.Join(folder.Path, entry.Name())
			if d.ignoreService.ShouldIgnore(entryPath) {
				continue
			}
			subfolder := d.createSubfolder(folder.Path, entry)
			folder.SubFolders = append(folder.SubFolders, subfolder)
		} else if strings.HasSuffix(entry.Name(), MARKDOWN_FILE_ENDING) {
			folder.DocumentCount++
		}
	}

	return folder, nil
}

func (d *DocumentService) createSubfolder(parentPath string, entry os.DirEntry) *models.Folder {
	entryInfo, err := entry.Info()
	if err != nil {
		return &models.Folder{
			Name:       entry.Name(),
			Path:       utils.NormalizePath(parentPath + "/" + entry.Name()),
			SubFolders: []*models.Folder{},
		}
	}

	subfolderPath := utils.NormalizePath(parentPath + "/" + entry.Name())
	subfolder := &models.Folder{
		Name:          entry.Name(),
		Path:          subfolderPath,
		Created:       entryInfo.ModTime(),
		DocumentCount: d.countDocumentsInFolder(subfolderPath),
		SubFolders:    []*models.Folder{},
	}

	return subfolder
}

func (d *DocumentService) countDocumentsInFolder(folderPath string) int {
	return countMarkdownFiles(utils.BuildFilePath(d.dataDir, folderPath))
}

// countMarkdownFiles counts the documents directly inside dir (0 if it
// cannot be read).
func countMarkdownFiles(dir string) int {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}

	count := 0
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), MARKDOWN_FILE_ENDING) {
			count++
		}
	}
	return count
}

func (d *DocumentService) getRootFolder() (*models.Folder, error) {
	info, err := os.Stat(d.dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to access root folder: %w", err)
	}

	folder := &models.Folder{
		Name:          "Root",
		Path:          "/",
		Created:       info.ModTime(),
		DocumentCount: 0,
		SubFolders:    []*models.Folder{},
	}

	entries, err := os.ReadDir(d.dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read root folder contents: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			entryPath := filepath.Join(d.dataDir, entry.Name())
			if d.ignoreService.ShouldIgnoreFile(entryPath) {
				continue
			}

			entryInfo, err := entry.Info()
			if err != nil {
				continue
			}

			folder.SubFolders = append(folder.SubFolders, &models.Folder{
				Name:          entry.Name(),
				Path:          "/" + entry.Name(),
				Created:       entryInfo.ModTime(),
				DocumentCount: countMarkdownFiles(entryPath),
				SubFolders:    []*models.Folder{},
			})
		} else if strings.HasSuffix(entry.Name(), MARKDOWN_FILE_ENDING) {
			folder.DocumentCount++
		}
	}

	return folder, nil
}

func (d *DocumentService) GetFolderTree() ([]*models.Folder, error) {
	folderMap := make(map[string]*models.Folder)
	var rootFolders []*models.Folder

	err := filepath.WalkDir(d.dataDir, func(path string, dirEntry os.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if path == d.dataDir {
			return nil
		}

		if d.ignoreService.ShouldIgnoreFile(path) {
			if dirEntry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		logicalPath, err := d.logicalPath(path)
		if err != nil {
			return err
		}

		if dirEntry.IsDir() {
			info, err := dirEntry.Info()
			if err != nil {
				return fmt.Errorf("failed to get file info: %w", err)
			}

			folder := &models.Folder{
				Name:          dirEntry.Name(),
				Path:          logicalPath,
				Created:       info.ModTime(),
				DocumentCount: 0,
				SubFolders:    []*models.Folder{},
			}

			folderMap[logicalPath] = folder

			parentPath := slashpath.Dir(logicalPath)
			isRootFolder := parentPath == "/" || parentPath == "."
			if isRootFolder {
				rootFolders = append(rootFolders, folder)
			} else {
				if parent, exists := folderMap[parentPath]; exists {
					parent.SubFolders = append(parent.SubFolders, folder)
				}
			}
		} else if strings.HasSuffix(dirEntry.Name(), MARKDOWN_FILE_ENDING) {
			folderPath := slashpath.Dir(logicalPath)
			if folderPath == "." {
				folderPath = "/"
			}

			if folder, exists := folderMap[folderPath]; exists {
				folder.DocumentCount++
			}
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to walk directory tree: %w", err)
	}

	return rootFolders, nil
}

func (d *DocumentService) CreateFolder(path string) error {
	if err := validatePath(path); err != nil {
		return err
	}

	folderPath := utils.BuildFilePath(d.dataDir, path)

	fileMode := os.FileMode(0755)
	if err := os.MkdirAll(folderPath, fileMode); err != nil {
		return fmt.Errorf("failed to create folder at path %s: %w", path, err)
	}

	return nil
}

func (d *DocumentService) RenameFolder(oldPath, newName string) error {
	if err := validatePath(oldPath); err != nil {
		return err
	}
	oldPath = utils.NormalizePath(oldPath)
	if oldPath == "/" {
		return errors.NewValidationError("cannot rename root folder")
	}

	if newName == "" {
		return errors.NewValidationError("new folder name cannot be empty")
	}
	if strings.Contains(newName, "/") {
		return errors.NewValidationError("folder name cannot contain '/' character")
	}
	// The new name is a single path segment and must follow the same rules as
	// any other path: "." / ".." or a backslash could escape the data dir, and
	// spaces etc. would leave documents at paths that can no longer be loaded.
	if err := utils.ValidatePath("/" + newName); err != nil {
		return errors.NewInvalidPathError(newName).WithCause(err)
	}

	newPath := utils.NormalizePath(slashpath.Dir(oldPath) + "/" + newName)

	oldFolderPath, newFolderPath, err := d.folderMoveTargets(oldPath, newPath)
	if err != nil {
		return err
	}

	if err := os.Rename(oldFolderPath, newFolderPath); err != nil {
		return fmt.Errorf("failed to rename folder from %s to %s: %w", oldFolderPath, newFolderPath, err)
	}

	documents, err := d.ListDocuments()
	if err != nil {
		if err := os.Rename(newFolderPath, oldFolderPath); err != nil {
			return fmt.Errorf("failed to rename folder from %s to %s: %w", newFolderPath, oldFolderPath, err)
		}
		return fmt.Errorf("failed to list documents: %w", err)
	}

	for _, document := range documentsUnder(documents, oldPath) {
		if err := d.updateDocumentPath(document, oldPath, newPath, oldFolderPath, newFolderPath); err != nil {
			return err
		}
	}

	return nil
}

// folderMoveTargets resolves the folders of a rename or move on disk: the
// source must exist and the target must not.
func (d *DocumentService) folderMoveTargets(oldPath, newPath string) (string, string, error) {
	oldFolderPath := utils.BuildFilePath(d.dataDir, oldPath)
	if _, err := os.Stat(oldFolderPath); os.IsNotExist(err) {
		return "", "", errors.NewNotFoundError("folder", oldPath)
	}

	newFolderPath := utils.BuildFilePath(d.dataDir, newPath)
	if _, err := os.Stat(newFolderPath); !os.IsNotExist(err) {
		return "", "", errors.NewAlreadyExistsError("folder", newPath)
	}

	return oldFolderPath, newFolderPath, nil
}

// documentsUnder returns the documents inside folderPath, at any depth.
func documentsUnder(documents []*models.Document, folderPath string) []*models.Document {
	var inside []*models.Document
	for _, document := range documents {
		documentPath := document.MetaData.Path
		if documentPath == folderPath || strings.HasPrefix(documentPath, folderPath+"/") {
			inside = append(inside, document)
		}
	}
	return inside
}

func (d *DocumentService) updateDocumentPath(
	document *models.Document,
	oldPath string,
	newPath string,
	oldFolderPath string,
	newFolderPath string) error {

	oldDocumentPath := document.MetaData.Path
	newDocumentPath := strings.Replace(oldDocumentPath, oldPath, newPath, 1)

	oldFileInNewFolder := d.buildFilePathFromPath(oldDocumentPath)
	newFileInNewFolder := strings.Replace(oldFileInNewFolder, oldFolderPath, newFolderPath, 1)

	fileContent, err := os.ReadFile(newFileInNewFolder)
	if err != nil {
		return fmt.Errorf("failed to read document file at %s: %w", newFileInNewFolder, err)
	}

	freshDocument, err := serializer.DeserializeDocument(fileContent)
	if err != nil {
		return fmt.Errorf("failed to deserialize document: %w", err)
	}

	freshDocument.MetaData.Path = utils.NormalizePath(newDocumentPath)
	freshDocument.MetaData.Slug = utils.ExtractSlugFromPath(newDocumentPath)
	freshDocument.MetaData.Updated = time.Now()

	content, err := serializer.SerializeDocument(freshDocument)
	if err != nil {
		return fmt.Errorf("failed to serialize document: %w", err)
	}

	if err := utils.WriteFileAtomic(newFileInNewFolder, content, 0644); err != nil {
		return fmt.Errorf("failed to write updated document file: %w", err)
	}
	return nil
}

func (d *DocumentService) MoveFolder(oldPath, newPath string) error {
	if err := validatePath(oldPath); err != nil {
		return err
	}
	if err := validatePath(newPath); err != nil {
		return err
	}
	oldPath = utils.NormalizePath(oldPath)
	newPath = utils.NormalizePath(newPath)

	if oldPath == "/" {
		return errors.NewValidationError("cannot move root folder")
	}

	if strings.Count(newPath, "/") < 2 {
		return errors.NewValidationError("cannot move folder to root level - use rename instead")
	}

	if strings.HasPrefix(newPath, oldPath+"/") {
		return errors.NewValidationError("cannot move folder into itself or its subdirectory")
	}

	oldFolderPath, newFolderPath, err := d.folderMoveTargets(oldPath, newPath)
	if err != nil {
		return err
	}

	parentPath := filepath.Dir(newFolderPath)
	if err := os.MkdirAll(parentPath, 0755); err != nil {
		return fmt.Errorf("failed to create parent directory: %w", err)
	}

	if err := os.Rename(oldFolderPath, newFolderPath); err != nil {
		return fmt.Errorf("failed to move folder from %s to %s: %w", oldFolderPath, newFolderPath, err)
	}

	documents, err := d.ListDocuments()
	if err != nil {
		if rollbackErr := os.Rename(newFolderPath, oldFolderPath); rollbackErr != nil {
			return fmt.Errorf("failed to list documents after move AND failed to rollback: %w (rollback error: %v)",
				err,
				rollbackErr)
		}
		return fmt.Errorf("failed to list documents after folder move: %w", err)
	}

	for _, document := range documentsUnder(documents, oldPath) {
		if err := d.updateDocumentPath(document, oldPath, newPath, oldFolderPath, newFolderPath); err != nil {
			if rollbackErr := os.Rename(newFolderPath, oldFolderPath); rollbackErr != nil {
				return fmt.Errorf("failed to update document metadata AND failed to rollback: %w (rollback error: %v)",
					err,
					rollbackErr)
			}
			return err
		}
	}

	return nil
}

func (d *DocumentService) DeleteFolder(path string) error {
	if err := validatePath(path); err != nil {
		return err
	}

	// Normalise first: "//" passes ValidatePath but resolves to the data dir
	// itself, and RemoveAll would wipe every note and the git history.
	if utils.NormalizePath(path) == "/" {
		return errors.NewValidationError("cannot delete root folder")
	}

	folderPath := utils.BuildFilePath(d.dataDir, path)

	if _, err := os.Stat(folderPath); os.IsNotExist(err) {
		return errors.NewNotFoundError("folder", path)
	}

	if err := os.RemoveAll(folderPath); err != nil {
		return fmt.Errorf("failed to delete folder at path %s: %w", path, err)
	}

	return nil
}

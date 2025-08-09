package services

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/serializer"
	"github.com/MorrisMorrison/schist/internal/utils"
)

const MARKDOWN_FILE_ENDING = ".md"

type DocumentService struct {
	dataDir       string
	gitService    *GitService
	ignoreService *IgnoreService
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

func (d *DocumentService) CreateDocument(document *models.Document) error {
	if document.MetaData.Slug == "" {
		document.MetaData.Slug = utils.GenerateSlug(document.MetaData.Title)
	}

	if document.MetaData.Path == "" {
		document.MetaData.Path = "/" + document.MetaData.Slug
	}

	now := time.Now()
	document.MetaData.Created = now
	document.MetaData.Updated = now

	if err := d.saveDocument(document); err != nil {
		return err
	}

	d.commitDocumentChange(document.MetaData.Path, fmt.Sprintf("Create document: %s", document.MetaData.Path))

	return nil
}

func (d *DocumentService) ReadDocument(slug string) (*models.Document, error) {
	filePath := d.buildFilePath(slug)
	fileContent, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("could not read file %s", slug)
	}

	document, err := serializer.DeserializeDocument(fileContent)
	if err != nil {
		return nil, fmt.Errorf("could not deserialize document")
	}

	return document, nil
}

func (d *DocumentService) UpdateDocument(document *models.Document) error {
	return d.UpdateDocumentWithSaveType(document, "manual")
}

func (d *DocumentService) UpdateDocumentWithSaveType(document *models.Document, saveType string) error {
	document.MetaData.Updated = time.Now()

	if err := d.saveDocument(document); err != nil {
		return err
	}

	// Only commit to git for manual saves, skip auto-saves to prevent version pollution
	if saveType == "manual" {
		d.commitDocumentChange(document.MetaData.Path, fmt.Sprintf("Update document: %s", document.MetaData.Path))
	}

	return nil
}

func (d *DocumentService) DeleteDocument(slug string) error {
	filePath := d.buildFilePath(slug)

	if err := os.Remove(filePath); err != nil {
		return fmt.Errorf("failed to delete document file: %w", err)
	}

	documentPath := "/" + strings.TrimSuffix(slug, MARKDOWN_FILE_ENDING)
	d.commitDocumentChange(documentPath, fmt.Sprintf("Delete document: %s", documentPath))

	return nil
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

		relPath, err := filepath.Rel(d.dataDir, path)
		if err != nil {
			return fmt.Errorf("failed to get relative path: %w", err)
		}

		logicalPath := "/" + strings.ReplaceAll(relPath, string(filepath.Separator), "/")

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

func (d *DocumentService) buildFilePath(slug string) string {
	return d.dataDir + "/" + slug + MARKDOWN_FILE_ENDING
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

	// 0644 = -rw-r--r-- = read/write permission for owner, read for others
	fileMode = os.FileMode(0644)
	if err := os.WriteFile(fileName, content, fileMode); err != nil {
		return fmt.Errorf("failed to write document file: %w", err)
	}
	return nil
}

func (d *DocumentService) GetDocumentByPath(path string) (*models.Document, error) {
	if err := utils.ValidatePath(path); err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}

	filePath := d.buildFilePathFromPath(path)

	fileContent, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("could not read document at path %s: %w", path, err)
	}

	document, err := serializer.DeserializeDocument(fileContent)
	if err != nil {
		return nil, fmt.Errorf("could not deserialize document at path %s: %w", path, err)
	}

	return document, nil
}

func (d *DocumentService) CreateDocumentInFolder(folderPath string, document *models.Document) error {
	if err := utils.ValidatePath(folderPath); err != nil {
		return fmt.Errorf("invalid folder path: %w", err)
	}

	if document.MetaData.Slug == "" {
		document.MetaData.Slug = utils.GenerateSlug(document.MetaData.Title)
	}

	document.MetaData.Path = utils.NormalizePath(folderPath + "/" + document.MetaData.Slug)

	now := time.Now()
	document.MetaData.Created = now
	document.MetaData.Updated = now

	return d.saveDocument(document)
}

func (d *DocumentService) MoveDocument(oldPath, newPath string) error {
	if err := utils.ValidatePath(oldPath); err != nil {
		return fmt.Errorf("invalid old path: %w", err)
	}
	if err := utils.ValidatePath(newPath); err != nil {
		return fmt.Errorf("invalid new path: %w", err)
	}

	normalizedOldPath := utils.NormalizePath(oldPath)
	normalizedNewPath := utils.NormalizePath(newPath)

	if normalizedOldPath == normalizedNewPath {
		return nil
	}

	document, err := d.GetDocumentByPath(oldPath)
	if err != nil {
		return fmt.Errorf("could not read document from old path: %w", err)
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

	d.commitDocumentChange(normalizedNewPath, fmt.Sprintf("Move document: %s -> %s", normalizedOldPath, normalizedNewPath))

	return nil
}

func (d *DocumentService) GetFolder(path string) (*models.Folder, error) {
	if err := utils.ValidatePath(path); err != nil {
		return nil, fmt.Errorf("invalid folder path: %w", err)
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
			return nil, fmt.Errorf("folder does not exist at path %s", path)
		}
		return nil, fmt.Errorf("failed to access folder at path %s: %w", path, err)
	}

	if !info.IsDir() {
		return nil, fmt.Errorf("path %s is not a directory", path)
	}

	return info, nil
}

func (d *DocumentService) createFolderStruct(path string, info os.FileInfo) *models.Folder {
	folderName := filepath.Base(path)
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
			entryPath := filepath.Join(folder.Path, entry.Name())
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
	subfolderFilePath := utils.BuildFilePath(d.dataDir, folderPath)
	subEntries, err := os.ReadDir(subfolderFilePath)
	if err != nil {
		return 0
	}

	count := 0
	for _, subEntry := range subEntries {
		if !subEntry.IsDir() && strings.HasSuffix(subEntry.Name(), MARKDOWN_FILE_ENDING) {
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

			subfolderPath := "/" + entry.Name()
			subfolder := &models.Folder{
				Name:          entry.Name(),
				Path:          subfolderPath,
				Created:       entryInfo.ModTime(),
				DocumentCount: 0,
				SubFolders:    []*models.Folder{},
			}

			subfolderFilePath := filepath.Join(d.dataDir, entry.Name())
			if subEntries, err := os.ReadDir(subfolderFilePath); err == nil {
				for _, subEntry := range subEntries {
					if !subEntry.IsDir() && strings.HasSuffix(subEntry.Name(), MARKDOWN_FILE_ENDING) {
						subfolder.DocumentCount++
					}
				}
			}

			folder.SubFolders = append(folder.SubFolders, subfolder)
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

		relPath, err := filepath.Rel(d.dataDir, path)
		if err != nil {
			return fmt.Errorf("failed to get relative path: %w", err)
		}

		logicalPath := "/" + strings.ReplaceAll(relPath, string(filepath.Separator), "/")

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

			parentPath := filepath.Dir(logicalPath)
			isRootFolder := parentPath == "/" || parentPath == "."
			if isRootFolder {
				rootFolders = append(rootFolders, folder)
			} else {
				if parent, exists := folderMap[parentPath]; exists {
					parent.SubFolders = append(parent.SubFolders, folder)
				}
			}
		} else if strings.HasSuffix(dirEntry.Name(), MARKDOWN_FILE_ENDING) {
			folderPath := filepath.Dir(logicalPath)
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
	if err := utils.ValidatePath(path); err != nil {
		return fmt.Errorf("invalid folder path: %w", err)
	}

	folderPath := utils.BuildFilePath(d.dataDir, path)

	fileMode := os.FileMode(0755)
	if err := os.MkdirAll(folderPath, fileMode); err != nil {
		return fmt.Errorf("failed to create folder at path %s: %w", path, err)
	}

	return nil
}

func (d *DocumentService) RenameFolder(oldPath, newName string) error {
	if err := utils.ValidatePath(oldPath); err != nil {
		return fmt.Errorf("invalid folder path: %w", err)
	}
	if oldPath == "/" {
		return fmt.Errorf("cannot rename root folder")
	}

	if newName == "" {
		return fmt.Errorf("new folder name cannot be empty")
	}
	if strings.Contains(newName, "/") {
		return fmt.Errorf("folder name cannot contain '/' character")
	}

	parentPath := filepath.Dir(oldPath)
	newPath := utils.NormalizePath(parentPath + "/" + newName)

	oldFolderPath := utils.BuildFilePath(d.dataDir, oldPath)
	if _, err := os.Stat(oldFolderPath); os.IsNotExist(err) {
		return fmt.Errorf("folder does not exist at path %s", oldPath)
	}

	newFolderPath := utils.BuildFilePath(d.dataDir, newPath)
	if _, err := os.Stat(newFolderPath); !os.IsNotExist(err) {
		return fmt.Errorf("folder already exists at path %s", newPath)
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

	var affectedDocuments []*models.Document
	for _, document := range documents {
		documentPath := document.MetaData.Path
		if documentPath == oldPath || strings.HasPrefix(documentPath, oldPath+"/") {
			affectedDocuments = append(affectedDocuments, document)
		}
	}

	for _, document := range affectedDocuments {
		shouldReturn, err1 := d.updateDocumentPath(document, oldPath, newPath, oldFolderPath, newFolderPath)
		if shouldReturn {
			return err1
		}
	}

	return nil
}

func (d *DocumentService) updateDocumentPath(
	document *models.Document,
	oldPath string,
	newPath string,
	oldFolderPath string,
	newFolderPath string) (bool, error) {

	oldDocumentPath := document.MetaData.Path
	newDocumentPath := strings.Replace(oldDocumentPath, oldPath, newPath, 1)

	oldFileInNewFolder := d.buildFilePathFromPath(oldDocumentPath)
	newFileInNewFolder := strings.Replace(oldFileInNewFolder, oldFolderPath, newFolderPath, 1)

	fileContent, err := os.ReadFile(newFileInNewFolder)
	if err != nil {
		return true, fmt.Errorf("failed to read document file at %s: %w", newFileInNewFolder, err)
	}

	freshDocument, err := serializer.DeserializeDocument(fileContent)
	if err != nil {
		return true, fmt.Errorf("failed to deserialize document: %w", err)
	}

	freshDocument.MetaData.Path = utils.NormalizePath(newDocumentPath)
	freshDocument.MetaData.Slug = utils.ExtractSlugFromPath(newDocumentPath)
	freshDocument.MetaData.Updated = time.Now()

	content, err := serializer.SerializeDocument(freshDocument)
	if err != nil {
		return true, fmt.Errorf("failed to serialize document: %w", err)
	}

	if err := os.WriteFile(newFileInNewFolder, content, 0644); err != nil {
		return true, fmt.Errorf("failed to write updated document file: %w", err)
	}
	return false, nil
}

func (d *DocumentService) MoveFolder(oldPath, newPath string) error {
	if err := utils.ValidatePath(oldPath); err != nil {
		return fmt.Errorf("invalid old folder path: %w", err)
	}
	if err := utils.ValidatePath(newPath); err != nil {
		return fmt.Errorf("invalid new folder path: %w", err)
	}

	if oldPath == "/" {
		return fmt.Errorf("cannot move root folder")
	}

	if strings.Count(newPath, "/") < 2 {
		return fmt.Errorf("cannot move folder to root level - use rename instead")
	}

	if strings.HasPrefix(newPath, oldPath+"/") {
		return fmt.Errorf("cannot move folder into itself or its subdirectory")
	}

	oldFolderPath := utils.BuildFilePath(d.dataDir, oldPath)
	if _, err := os.Stat(oldFolderPath); os.IsNotExist(err) {
		return fmt.Errorf("folder does not exist at path %s", oldPath)
	}

	newFolderPath := utils.BuildFilePath(d.dataDir, newPath)
	if _, err := os.Stat(newFolderPath); !os.IsNotExist(err) {
		return fmt.Errorf("destination folder already exists at path %s", newPath)
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

	var affectedDocuments []*models.Document
	for _, document := range documents {
		documentPath := document.MetaData.Path
		if documentPath == oldPath || strings.HasPrefix(documentPath, oldPath+"/") {
			affectedDocuments = append(affectedDocuments, document)
		}
	}

	for _, document := range affectedDocuments {
		if _, err := d.updateDocumentPath(document, oldPath, newPath, oldFolderPath, newFolderPath); err != nil {
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
	if err := utils.ValidatePath(path); err != nil {
		return fmt.Errorf("invalid folder path: %w", err)
	}

	if path == "/" {
		return fmt.Errorf("cannot delete root folder")
	}

	folderPath := utils.BuildFilePath(d.dataDir, path)

	if _, err := os.Stat(folderPath); os.IsNotExist(err) {
		return fmt.Errorf("folder does not exist at path %s", path)
	}

	if err := os.RemoveAll(folderPath); err != nil {
		return fmt.Errorf("failed to delete folder at path %s: %w", path, err)
	}

	return nil
}

func (d *DocumentService) GetDocumentVersions(documentPath string) ([]*DocumentVersion, error) {
	if d.gitService == nil {
		return nil, fmt.Errorf("git service not available")
	}

	return d.gitService.GetDocumentVersions(documentPath)
}

func (d *DocumentService) GetDocumentAtVersion(documentPath string, commitHash string) (*models.Document, error) {
	if d.gitService == nil {
		return nil, fmt.Errorf("git service not available")
	}

	return d.gitService.GetDocumentAtVersion(documentPath, commitHash)
}

func (d *DocumentService) commitDocumentChange(documentPath string, message string) {
	if d.gitService == nil {
		return
	}

	if err := d.gitService.CommitDocument(documentPath, message); err != nil {
		log.Printf("Warning: Failed to commit document change for %s: %v", documentPath, err)
	}
}

func (d *DocumentService) CompareDocumentVersions(documentPath, hash1, hash2 string) (*DiffResult, error) {
	if d.gitService == nil {
		return nil, fmt.Errorf("git service not available")
	}

	return d.gitService.CompareVersions(documentPath, hash1, hash2)
}

func (d *DocumentService) RestoreDocumentToVersion(path, commitHash string) error {
	if d.gitService == nil {
		return fmt.Errorf("git service not available")
	}

	if err := d.gitService.RestoreDocument(path, commitHash); err != nil {
		return fmt.Errorf("failed to restore document: %w", err)
	}

	return nil
}

func (d *DocumentService) ImportDocuments(
	files []*multipart.FileHeader,
	options *models.ImportOptions,
) (*models.ImportResult, error) {
	result := &models.ImportResult{
		Success:    make([]models.ImportedDocument, 0),
		Failed:     make([]models.ImportError, 0),
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

	finalPath := d.determineFinalPath(slug, options.TargetPath, options.OverwriteMode)

	now := time.Now()
	metadata := &models.DocumentMetaData{
		Slug:    slug,
		Title:   title,
		Path:    finalPath,
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
		FinalPath:    finalPath,
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

func (d *DocumentService) determineFinalPath(slug, targetPath, overwriteMode string) string {
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
			break
		}

		switch overwriteMode {
		case "overwrite":
			// Use the path as-is, will overwrite
			// No action needed, exit the loop
		case "skip":
			// This would require different handling in the calling function
			// For now, treat as rename
			fallthrough
		default: // "rename" or empty
			finalPath = fmt.Sprintf("%s-%d", basePath, counter)
			counter++
			continue
		}
		break
	}

	return finalPath
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

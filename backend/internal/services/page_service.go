package services

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/serializer"
	"github.com/MorrisMorrison/schist/internal/utils"
)

const MARKDOWN_FILE_ENDING = ".md"

type PageService struct {
	dataDir string
}

func NewPageService(dataDir string) *PageService {
	return &PageService{
		dataDir: dataDir,
	}
}

func (p *PageService) Search(query string) ([]*models.Page, error) {
	pages, err := p.ListPages()
	if err != nil {
		return nil, err
	}

	var filtered []*models.Page
	lowerQuery := strings.ToLower(query)

	for _, page := range pages {
		if strings.Contains(page.MetaData.Path, "/trash") {
			continue
		}
		if strings.Contains(strings.ToLower(page.MetaData.Title), lowerQuery) {
			filtered = append(filtered, page)
		}
	}

	return filtered, nil

}

func (p *PageService) CreatePage(page *models.Page) error {
	if page.MetaData.Slug == "" {
		page.MetaData.Slug = utils.GenerateSlug(page.MetaData.Title)
	}

	if page.MetaData.Path == "" {
		page.MetaData.Path = "/" + page.MetaData.Slug
	}

	now := time.Now()
	page.MetaData.Created = now
	page.MetaData.Updated = now

	return p.savePage(page)
}

func (p *PageService) ReadPage(slug string) (*models.Page, error) {
	filePath := p.buildFilePath(slug)
	fileContent, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("could not read file %s", slug)
	}

	page, err := serializer.DeserializePage(fileContent)
	if err != nil {
		return nil, fmt.Errorf("could not deserialize page")
	}

	return page, nil
}

func (p *PageService) UpdatePage(page *models.Page) error {
	page.MetaData.Updated = time.Now()
	return p.savePage(page)
}

func (p *PageService) DeletePage(slug string) error {

	filePath := p.buildFilePath(slug)
	if err := os.Remove(filePath); err != nil {
		return fmt.Errorf("failed to delete page file: %w", err)
	}
	return nil
}

func (p *PageService) ListPages() ([]*models.Page, error) {
	var pages []*models.Page

	err := filepath.WalkDir(p.dataDir, func(path string, dirEntry os.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if dirEntry.IsDir() {
			return nil
		}

		if !strings.HasSuffix(dirEntry.Name(), MARKDOWN_FILE_ENDING) {
			return nil
		}

		relPath, err := filepath.Rel(p.dataDir, path)
		if err != nil {
			return fmt.Errorf("failed to get relative path: %w", err)
		}

		logicalPath := "/" + strings.ReplaceAll(relPath, string(filepath.Separator), "/")

		logicalPath = strings.TrimSuffix(logicalPath, MARKDOWN_FILE_ENDING)

		page, err := p.GetPageByPath(logicalPath)
		if err != nil {
			return err
		}

		pages = append(pages, page)
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to walk directory tree: %w", err)
	}

	return pages, nil
}

func (p *PageService) buildFilePath(slug string) string {
	return p.dataDir + "/" + slug + MARKDOWN_FILE_ENDING
}

func (p *PageService) buildFilePathFromPath(path string) string {
	slug := utils.ExtractSlugFromPath(path)

	fullPath := utils.BuildFilePath(p.dataDir, path)

	dir := filepath.Dir(fullPath)
	return filepath.Join(dir, slug+MARKDOWN_FILE_ENDING)
}

func (p *PageService) savePage(page *models.Page) error {
	content, err := serializer.SerializePage(page)
	if err != nil {
		return fmt.Errorf("failed to serialize page: %w", err)
	}

	fileName := p.buildFilePathFromPath(page.MetaData.Path)

	dir := filepath.Dir(fileName)
	fileMode := os.FileMode(0755)
	if err := os.MkdirAll(dir, fileMode); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", dir, err)
	}

	// 0644 = -rw-r--r-- = read/write permission for owner, read for others
	fileMode = os.FileMode(0644)
	if err := os.WriteFile(fileName, content, fileMode); err != nil {
		return fmt.Errorf("failed to write page file: %w", err)
	}
	return nil
}

func (p *PageService) GetPageByPath(path string) (*models.Page, error) {
	if err := utils.ValidatePath(path); err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}

	filePath := p.buildFilePathFromPath(path)

	fileContent, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("could not read page at path %s: %w", path, err)
	}

	page, err := serializer.DeserializePage(fileContent)
	if err != nil {
		return nil, fmt.Errorf("could not deserialize page at path %s: %w", path, err)
	}

	return page, nil
}

func (p *PageService) CreatePageInFolder(folderPath string, page *models.Page) error {
	if err := utils.ValidatePath(folderPath); err != nil {
		return fmt.Errorf("invalid folder path: %w", err)
	}

	if page.MetaData.Slug != "" {
		page.MetaData.Slug = utils.GenerateSlug(page.MetaData.Title)
	}

	page.MetaData.Path = utils.NormalizePath(folderPath + "/" + page.MetaData.Slug)

	now := time.Now()
	page.MetaData.Created = now
	page.MetaData.Updated = now

	return p.savePage(page)
}

func (p *PageService) MovePage(oldPath, newPath string) error {
	if err := utils.ValidatePath(oldPath); err != nil {
		return fmt.Errorf("invalid old path: %w", err)
	}
	if err := utils.ValidatePath(newPath); err != nil {
		return fmt.Errorf("invalid new path: %w", err)
	}

	page, err := p.GetPageByPath(oldPath)
	if err != nil {
		return fmt.Errorf("could not read page from old path: %w", err)
	}

	page.MetaData.Path = utils.NormalizePath(newPath)
	page.MetaData.Slug = utils.ExtractSlugFromPath(newPath)
	page.MetaData.Updated = time.Now()

	if err := p.savePage(page); err != nil {
		return fmt.Errorf("could not save page to new path: %w", err)
	}

	oldFilePath := p.buildFilePathFromPath(oldPath)
	if err := os.Remove(oldFilePath); err != nil {
		return fmt.Errorf("could not remove old file: %w", err)
	}

	return nil
}

func (p *PageService) GetFolder(path string) (*models.Folder, error) {
	if err := utils.ValidatePath(path); err != nil {
		return nil, fmt.Errorf("invalid folder path: %w", err)
	}

	if path == "/" {
		return p.getRootFolder()
	}

	return p.buildFolderFromPath(path)
}

func (p *PageService) buildFolderFromPath(path string) (*models.Folder, error) {
	folderPath := utils.BuildFilePath(p.dataDir, path)
	info, err := p.validateFolderPath(folderPath, path)
	if err != nil {
		return nil, err
	}

	folder := p.createFolderStruct(path, info)
	return p.populateFolderContents(folder, folderPath)
}

func (p *PageService) validateFolderPath(folderPath, path string) (os.FileInfo, error) {
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

func (p *PageService) createFolderStruct(path string, info os.FileInfo) *models.Folder {
	folderName := filepath.Base(path)
	if folderName == "." || folderName == "/" {
		folderName = "Root"
	}

	return &models.Folder{
		Name:       folderName,
		Path:       path,
		Created:    info.ModTime(),
		PageCount:  0,
		SubFolders: []*models.Folder{},
	}
}

func (p *PageService) populateFolderContents(folder *models.Folder, folderPath string) (*models.Folder, error) {
	entries, err := os.ReadDir(folderPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read folder contents at path %s: %w", folder.Path, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			subfolder := p.createSubfolder(folder.Path, entry)
			folder.SubFolders = append(folder.SubFolders, subfolder)
		} else if strings.HasSuffix(entry.Name(), MARKDOWN_FILE_ENDING) {
			folder.PageCount++
		}
	}

	return folder, nil
}

func (p *PageService) createSubfolder(parentPath string, entry os.DirEntry) *models.Folder {
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
		Name:       entry.Name(),
		Path:       subfolderPath,
		Created:    entryInfo.ModTime(),
		PageCount:  p.countPagesInFolder(subfolderPath),
		SubFolders: []*models.Folder{},
	}

	return subfolder
}

func (p *PageService) countPagesInFolder(folderPath string) int {
	subfolderFilePath := utils.BuildFilePath(p.dataDir, folderPath)
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

func (p *PageService) getRootFolder() (*models.Folder, error) {
	info, err := os.Stat(p.dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to access root folder: %w", err)
	}

	folder := &models.Folder{
		Name:       "Root",
		Path:       "/",
		Created:    info.ModTime(),
		PageCount:  0,
		SubFolders: []*models.Folder{},
	}

	entries, err := os.ReadDir(p.dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read root folder contents: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			entryInfo, err := entry.Info()
			if err != nil {
				continue
			}

			subfolderPath := "/" + entry.Name()
			subfolder := &models.Folder{
				Name:       entry.Name(),
				Path:       subfolderPath,
				Created:    entryInfo.ModTime(),
				PageCount:  0,
				SubFolders: []*models.Folder{},
			}

			subfolderFilePath := filepath.Join(p.dataDir, entry.Name())
			if subEntries, err := os.ReadDir(subfolderFilePath); err == nil {
				for _, subEntry := range subEntries {
					if !subEntry.IsDir() && strings.HasSuffix(subEntry.Name(), MARKDOWN_FILE_ENDING) {
						subfolder.PageCount++
					}
				}
			}

			folder.SubFolders = append(folder.SubFolders, subfolder)
		} else if strings.HasSuffix(entry.Name(), MARKDOWN_FILE_ENDING) {
			folder.PageCount++
		}
	}

	return folder, nil
}

func (p *PageService) GetFolderTree() ([]*models.Folder, error) {
	folderMap := make(map[string]*models.Folder)
	var rootFolders []*models.Folder

	err := filepath.WalkDir(p.dataDir, func(path string, dirEntry os.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Skip the root data directory itself
		if path == p.dataDir {
			return nil
		}

		if strings.Contains(path, "/assets") {
			return nil
		}

		relPath, err := filepath.Rel(p.dataDir, path)
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
				Name:       dirEntry.Name(),
				Path:       logicalPath,
				Created:    info.ModTime(),
				PageCount:  0,
				SubFolders: []*models.Folder{},
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
				folder.PageCount++
			}
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to walk directory tree: %w", err)
	}

	return rootFolders, nil
}

func (p *PageService) CreateFolder(path string) error {
	if err := utils.ValidatePath(path); err != nil {
		return fmt.Errorf("invalid folder path: %w", err)
	}

	folderPath := utils.BuildFilePath(p.dataDir, path)

	fileMode := os.FileMode(0755)
	if err := os.MkdirAll(folderPath, fileMode); err != nil {
		return fmt.Errorf("failed to create folder at path %s: %w", path, err)
	}

	return nil
}

func (p *PageService) RenameFolder(oldPath, newName string) error {
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

	oldFolderPath := utils.BuildFilePath(p.dataDir, oldPath)
	if _, err := os.Stat(oldFolderPath); os.IsNotExist(err) {
		return fmt.Errorf("folder does not exist at path %s", oldPath)
	}

	newFolderPath := utils.BuildFilePath(p.dataDir, newPath)
	if _, err := os.Stat(newFolderPath); !os.IsNotExist(err) {
		return fmt.Errorf("folder already exists at path %s", newPath)
	}

	if err := os.Rename(oldFolderPath, newFolderPath); err != nil {
		return fmt.Errorf("failed to rename folder from %s to %s: %w", oldFolderPath, newFolderPath, err)
	}

	pages, err := p.ListPages()
	if err != nil {
		if err := os.Rename(newFolderPath, oldFolderPath); err != nil {
			return fmt.Errorf("failed to rename folder from %s to %s: %w", newFolderPath, oldFolderPath, err)
		}
		return fmt.Errorf("failed to list pages: %w", err)
	}

	var affectedPages []*models.Page
	for _, page := range pages {
		pagePath := page.MetaData.Path
		if pagePath == oldPath || strings.HasPrefix(pagePath, oldPath+"/") {
			affectedPages = append(affectedPages, page)
		}
	}

	for _, page := range affectedPages {
		shouldReturn, err1 := p.updatePagePath(page, oldPath, newPath, oldFolderPath, newFolderPath)
		if shouldReturn {
			return err1
		}
	}

	return nil
}

func (p *PageService) updatePagePath(
	page *models.Page,
	oldPath string,
	newPath string,
	oldFolderPath string,
	newFolderPath string) (bool, error) {

	oldPagePath := page.MetaData.Path
	newPagePath := strings.Replace(oldPagePath, oldPath, newPath, 1)

	oldFileInNewFolder := p.buildFilePathFromPath(oldPagePath)
	newFileInNewFolder := strings.Replace(oldFileInNewFolder, oldFolderPath, newFolderPath, 1)

	fileContent, err := os.ReadFile(newFileInNewFolder)
	if err != nil {
		return true, fmt.Errorf("failed to read page file at %s: %w", newFileInNewFolder, err)
	}

	freshPage, err := serializer.DeserializePage(fileContent)
	if err != nil {
		return true, fmt.Errorf("failed to deserialize page: %w", err)
	}

	freshPage.MetaData.Path = utils.NormalizePath(newPagePath)
	freshPage.MetaData.Slug = utils.ExtractSlugFromPath(newPagePath)
	freshPage.MetaData.Updated = time.Now()

	content, err := serializer.SerializePage(freshPage)
	if err != nil {
		return true, fmt.Errorf("failed to serialize page: %w", err)
	}

	if err := os.WriteFile(newFileInNewFolder, content, 0644); err != nil {
		return true, fmt.Errorf("failed to write updated page file: %w", err)
	}
	return false, nil
}

func (p *PageService) MoveFolder(oldPath, newPath string) error {
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

	oldFolderPath := utils.BuildFilePath(p.dataDir, oldPath)
	if _, err := os.Stat(oldFolderPath); os.IsNotExist(err) {
		return fmt.Errorf("folder does not exist at path %s", oldPath)
	}

	newFolderPath := utils.BuildFilePath(p.dataDir, newPath)
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

	pages, err := p.ListPages()
	if err != nil {
		if rollbackErr := os.Rename(newFolderPath, oldFolderPath); rollbackErr != nil {
			return fmt.Errorf("failed to list pages after move AND failed to rollback: %w (rollback error: %v)",
				err,
				rollbackErr)
		}
		return fmt.Errorf("failed to list pages after folder move: %w", err)
	}

	var affectedPages []*models.Page
	for _, page := range pages {
		pagePath := page.MetaData.Path
		if pagePath == oldPath || strings.HasPrefix(pagePath, oldPath+"/") {
			affectedPages = append(affectedPages, page)
		}
	}

	for _, page := range affectedPages {
		if err := p.updatePagePathForMove(page, oldPath, newPath, oldFolderPath, newFolderPath); err != nil {
			if rollbackErr := os.Rename(newFolderPath, oldFolderPath); rollbackErr != nil {
				return fmt.Errorf("failed to update page metadata AND failed to rollback: %w (rollback error: %v)",
					err,
					rollbackErr)
			}
			return err
		}
	}

	return nil
}

func (p *PageService) updatePagePathForMove(
	page *models.Page,
	oldPath string,
	newPath string,
	oldFolderPath string,
	newFolderPath string) error {

	oldPagePath := page.MetaData.Path
	newPagePath := strings.Replace(oldPagePath, oldPath, newPath, 1)

	newFileInNewFolder := strings.Replace(p.buildFilePathFromPath(oldPagePath), oldFolderPath, newFolderPath, 1)

	fileContent, err := os.ReadFile(newFileInNewFolder)
	if err != nil {
		return fmt.Errorf("failed to read page file at %s: %w", newFileInNewFolder, err)
	}

	freshPage, err := serializer.DeserializePage(fileContent)
	if err != nil {
		return fmt.Errorf("failed to deserialize page: %w", err)
	}

	freshPage.MetaData.Path = utils.NormalizePath(newPagePath)
	freshPage.MetaData.Slug = utils.ExtractSlugFromPath(newPagePath)
	freshPage.MetaData.Updated = time.Now()

	content, err := serializer.SerializePage(freshPage)
	if err != nil {
		return fmt.Errorf("failed to serialize page: %w", err)
	}

	if err := os.WriteFile(newFileInNewFolder, content, 0644); err != nil {
		return fmt.Errorf("failed to write updated page file: %w", err)
	}

	return nil
}

func (p *PageService) DeleteFolder(path string) error {
	if err := utils.ValidatePath(path); err != nil {
		return fmt.Errorf("invalid folder path: %w", err)
	}

	if path == "/" {
		return fmt.Errorf("cannot delete root folder")
	}

	folderPath := utils.BuildFilePath(p.dataDir, path)

	if _, err := os.Stat(folderPath); os.IsNotExist(err) {
		return fmt.Errorf("folder does not exist at path %s", path)
	}

	if err := os.RemoveAll(folderPath); err != nil {
		return fmt.Errorf("failed to delete folder at path %s: %w", path, err)
	}

	return nil
}

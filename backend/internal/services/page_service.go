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
	pathutils "github.com/MorrisMorrison/schist/internal/utils"
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
	return os.Remove(filePath)
}

func (p *PageService) ListPages() ([]*models.Page, error) {
	var pages []*models.Page

	err := filepath.WalkDir(p.dataDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Skip directories
		if d.IsDir() {
			return nil
		}

		// Only process markdown files
		if !strings.HasSuffix(d.Name(), MARKDOWN_FILE_ENDING) {
			return nil
		}

		// Get relative path from data directory
		relPath, err := filepath.Rel(p.dataDir, path)
		if err != nil {
			return err
		}

		// Convert to logical path (Unix-style separators)
		logicalPath := "/" + strings.ReplaceAll(relPath, string(filepath.Separator), "/")

		// Remove .md extension from logical path
		logicalPath = strings.TrimSuffix(logicalPath, MARKDOWN_FILE_ENDING)

		// Read the page using the logical path
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
	slug := pathutils.ExtractSlugFromPath(path)

	fullPath := pathutils.BuildFilePath(p.dataDir, path)

	dir := filepath.Dir(fullPath)
	return filepath.Join(dir, slug+MARKDOWN_FILE_ENDING)
}

func (p *PageService) savePage(page *models.Page) error {
	content, err := serializer.SerializePage(page)
	if err != nil {
		return err
	}

	fileName := p.buildFilePathFromPath(page.MetaData.Path)

	// Create directory structure if it doesn't exist
	dir := filepath.Dir(fileName)
	fileMode := os.FileMode(0755)
	if err := os.MkdirAll(dir, fileMode); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", dir, err)
	}

	// 0644 = -rw-r--r-- = read/write permission for owner, read for others
	fileMode = os.FileMode(0644)
	return os.WriteFile(fileName, content, fileMode)
}

func (p *PageService) GetPageByPath(path string) (*models.Page, error) {
	if err := pathutils.ValidatePath(path); err != nil {
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
	if err := pathutils.ValidatePath(folderPath); err != nil {
		return fmt.Errorf("invalid folder path: %w", err)
	}

	if page.MetaData.Slug != "" {
		page.MetaData.Slug = utils.GenerateSlug(page.MetaData.Title)
	}

	page.MetaData.Path = pathutils.NormalizePath(folderPath + "/" + page.MetaData.Slug)

	now := time.Now()
	page.MetaData.Created = now
	page.MetaData.Updated = now

	return p.savePage(page)
}

func (p *PageService) MovePage(oldPath, newPath string) error {
	if err := pathutils.ValidatePath(oldPath); err != nil {
		return fmt.Errorf("invalid old path: %w", err)
	}
	if err := pathutils.ValidatePath(newPath); err != nil {
		return fmt.Errorf("invalid new path: %w", err)
	}

	page, err := p.GetPageByPath(oldPath)
	if err != nil {
		return fmt.Errorf("could not read page from old path: %w", err)
	}

	page.MetaData.Path = pathutils.NormalizePath(newPath)
	page.MetaData.Slug = pathutils.ExtractSlugFromPath(newPath)
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
	if err := pathutils.ValidatePath(path); err != nil {
		return nil, fmt.Errorf("invalid folder path: %w", err)
	}

	// Handle root folder case
	if path == "/" {
		return p.getRootFolder()
	}

	folderPath := pathutils.BuildFilePath(p.dataDir, path)

	// Check if folder exists
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

	// Extract folder name from path
	folderName := filepath.Base(path)
	if folderName == "." || folderName == "/" {
		folderName = "Root"
	}

	// Create folder struct
	folder := &models.Folder{
		Name:       folderName,
		Path:       path,
		Created:    info.ModTime(),
		PageCount:  0,
		SubFolders: []*models.Folder{},
	}

	// Read directory contents
	entries, err := os.ReadDir(folderPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read folder contents at path %s: %w", path, err)
	}

	// Process directory entries
	for _, entry := range entries {
		if entry.IsDir() {
			// Add subfolder
			entryInfo, err := entry.Info()
			if err != nil {
				continue // Skip entries we can't read
			}

			subfolderPath := pathutils.NormalizePath(path + "/" + entry.Name())
			subfolder := &models.Folder{
				Name:       entry.Name(),
				Path:       subfolderPath,
				Created:    entryInfo.ModTime(),
				PageCount:  0,
				SubFolders: []*models.Folder{},
			}

			// Count pages in subfolder
			subfolderFilePath := pathutils.BuildFilePath(p.dataDir, subfolderPath)
			if subEntries, err := os.ReadDir(subfolderFilePath); err == nil {
				for _, subEntry := range subEntries {
					if !subEntry.IsDir() && strings.HasSuffix(subEntry.Name(), MARKDOWN_FILE_ENDING) {
						subfolder.PageCount++
					}
				}
			}

			folder.SubFolders = append(folder.SubFolders, subfolder)
		} else if strings.HasSuffix(entry.Name(), MARKDOWN_FILE_ENDING) {
			// Count pages in current folder
			folder.PageCount++
		}
	}

	return folder, nil
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

	// Read root directory contents
	entries, err := os.ReadDir(p.dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read root folder contents: %w", err)
	}

	// Process directory entries
	for _, entry := range entries {
		if entry.IsDir() {
			// Add subfolder
			entryInfo, err := entry.Info()
			if err != nil {
				continue // Skip entries we can't read
			}

			subfolderPath := "/" + entry.Name()
			subfolder := &models.Folder{
				Name:       entry.Name(),
				Path:       subfolderPath,
				Created:    entryInfo.ModTime(),
				PageCount:  0,
				SubFolders: []*models.Folder{},
			}

			// Count pages in subfolder
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
			// Count pages in root folder
			folder.PageCount++
		}
	}

	return folder, nil
}

func (p *PageService) GetFolderTree() ([]*models.Folder, error) {
	folderMap := make(map[string]*models.Folder)
	var rootFolders []*models.Folder

	err := filepath.WalkDir(p.dataDir, func(path string, d os.DirEntry, err error) error {
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
			return err
		}

		logicalPath := "/" + strings.ReplaceAll(relPath, string(filepath.Separator), "/")

		if d.IsDir() {
			info, err := d.Info()
			if err != nil {
				return err
			}

			folder := &models.Folder{
				Name:       d.Name(),
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
		} else if strings.HasSuffix(d.Name(), MARKDOWN_FILE_ENDING) {
			// Count pages in folders
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
	if err := pathutils.ValidatePath(path); err != nil {
		return fmt.Errorf("invalid folder path: %w", err)
	}

	folderPath := pathutils.BuildFilePath(p.dataDir, path)

	fileMode := os.FileMode(0755)
	if err := os.MkdirAll(folderPath, fileMode); err != nil {
		return fmt.Errorf("failed to create folder at path %s: %w", path, err)
	}

	return nil
}

func (p *PageService) DeleteFolder(path string) error {
	if err := pathutils.ValidatePath(path); err != nil {
		return fmt.Errorf("invalid folder path: %w", err)
	}

	if path == "/" {
		return fmt.Errorf("cannot delete root folder")
	}

	folderPath := pathutils.BuildFilePath(p.dataDir, path)

	if _, err := os.Stat(folderPath); os.IsNotExist(err) {
		return fmt.Errorf("folder does not exist at path %s", path)
	}

	if err := os.RemoveAll(folderPath); err != nil {
		return fmt.Errorf("failed to delete folder at path %s: %w", path, err)
	}

	return nil
}

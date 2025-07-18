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
	dir := p.dataDir
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("could not read dir %s: %w", dir, err)
	}

	pages := make([]*models.Page, 0, len(files))
	for _, file := range files {
		if file.IsDir() {
			continue
		}

		if !strings.HasSuffix(file.Name(), MARKDOWN_FILE_ENDING) {
			continue
		}

		fileName := strings.TrimSuffix(file.Name(), MARKDOWN_FILE_ENDING)
		page, err := p.ReadPage(fileName)
		if err != nil {
			return nil, err
		}

		pages = append(pages, page)
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

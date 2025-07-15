package services

import (
	"fmt"
	"os"
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

func (p *PageService) CreatePage(page *models.Page) error {
	if page.MetaData.Slug == "" {
		page.MetaData.Slug = utils.GenerateSlug(page.MetaData.Title)
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

		// Only process .md files
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

func (p *PageService) savePage(page *models.Page) error {
	content, err := serializer.SerializePage(page)
	if err != nil {
		return err
	}

	// 0644 = -rw-r--r-- = read/write permission for owner, read for others
	fileMode := 0644
	fileName := p.buildFilePath(page.MetaData.Slug)
	return os.WriteFile(fileName, content, os.FileMode(fileMode))
}

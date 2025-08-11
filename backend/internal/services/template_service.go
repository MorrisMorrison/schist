package services

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type Template struct {
	ID          string            `json:"id"`
	Title       string            `json:"title"`
	Description string            `json:"description"`
	Tags        []string          `json:"tags"`
	Category    string            `json:"category"`
	Content     string            `json:"content"`
	Metadata    map[string]string `json:"metadata"`
}

type TemplateService struct {
	templatesDir string
}

func NewTemplateService(dataDir string) *TemplateService {
	templatesDir := os.Getenv("SCHIST_TEMPLATES_DIR")
	if templatesDir == "" {
		templatesDir = "../../../templates"
	}

	return &TemplateService{
		templatesDir: templatesDir,
	}
}

func (s *TemplateService) GetTemplates() ([]Template, error) {
	if err := os.MkdirAll(s.templatesDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create templates directory: %w", err)
	}

	entries, err := os.ReadDir(s.templatesDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read templates directory: %w", err)
	}

	var templates []Template
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		template, err := s.loadTemplate(entry.Name())
		if err != nil {
			log.Printf("Warning: failed to load template %s: %v", entry.Name(), err)
			continue
		}

		templates = append(templates, template)
	}

	return templates, nil
}

func (s *TemplateService) loadTemplate(filename string) (Template, error) {
	filepath := filepath.Join(s.templatesDir, filename)
	content, err := os.ReadFile(filepath)
	if err != nil {
		return Template{}, fmt.Errorf("failed to read template file: %w", err)
	}

	parts := strings.SplitN(string(content), "---", 3)
	if len(parts) < 3 {
		return Template{}, fmt.Errorf("invalid template format: missing front matter")
	}

	var frontMatter struct {
		Title       string            `yaml:"title"`
		Description string            `yaml:"description"`
		Tags        []string          `yaml:"tags"`
		Category    string            `yaml:"category"`
		Metadata    map[string]string `yaml:",inline"`
	}

	if err := yaml.Unmarshal([]byte(parts[1]), &frontMatter); err != nil {
		return Template{}, fmt.Errorf("failed to parse front matter: %w", err)
	}

	id := strings.TrimSuffix(filename, ".md")

	return Template{
		ID:          id,
		Title:       frontMatter.Title,
		Description: frontMatter.Description,
		Tags:        frontMatter.Tags,
		Category:    frontMatter.Category,
		Content:     strings.TrimSpace(parts[2]),
		Metadata:    frontMatter.Metadata,
	}, nil
}

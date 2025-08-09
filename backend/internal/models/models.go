package models

import (
	"path/filepath"
	"strings"
	"time"
)

type Document struct {
	MetaData *DocumentMetaData `json:"metaData"`
	Content  string            `json:"content"`
}

type DocumentMetaData struct {
	Slug    string    `yaml:"slug,omitempty" json:"slug,omitempty"`
	Title   string    `yaml:"title" json:"title"`
	Path    string    `yaml:"path" json:"path"`
	Created time.Time `yaml:"created" json:"created"`
	Updated time.Time `yaml:"updated" json:"updated"`
	Tags    []string  `yaml:"tags,omitempty" json:"tags,omitempty"`
}

func (d *DocumentMetaData) ParentPath() string {
	return filepath.Dir(d.Path)
}

func (d *DocumentMetaData) Depth() int {
	return strings.Count(d.Path, "/")
}

type Folder struct {
	Name          string    `json:"name"`
	Path          string    `json:"path"`
	Created       time.Time `json:"created"`
	DocumentCount int       `json:"document_count"`
	SubFolders    []*Folder `json:"sub_folders"`
}

func (f *Folder) ParentPath() string {
	return filepath.Dir(f.Path)
}

func (f *Folder) Depth() int {
	return strings.Count(f.Path, "/")
}

type Asset struct {
	Name         string    `json:"name"`
	OriginalName string    `json:"original_name"`
	Path         string    `json:"path"`
	Size         int64     `json:"size"`
	ContentType  string    `json:"content_type"`
	Created      time.Time `json:"created"`
}

type ImportOptions struct {
	TargetPath    string `json:"target_path"`
	OverwriteMode string `json:"overwrite_mode"` // "skip", "overwrite", "rename"
}

type ImportResult struct {
	Success       []ImportedDocument `json:"success"`
	Failed        []ImportError      `json:"failed"`
	Skipped       []ImportedDocument `json:"skipped"`
	TotalFiles    int                `json:"total_files"`
	ImportedCount int                `json:"imported_count"`
	FailedCount   int                `json:"failed_count"`
	SkippedCount  int                `json:"skipped_count"`
}

type ImportedDocument struct {
	OriginalName string `json:"original_name"`
	FinalPath    string `json:"final_path"`
	Title        string `json:"title"`
}

type ImportError struct {
	OriginalName string `json:"original_name"`
	Error        string `json:"error"`
}

// Export-related types
type ExportType string

const (
	ExportTypeDocument ExportType = "document"
	ExportTypeFolder   ExportType = "folder"
	ExportTypeAll      ExportType = "all"
)

type ExportOptions struct {
	Path        string     `json:"path,omitempty"`
	Type        ExportType `json:"type"`
	Format      string     `json:"format,omitempty"` // "zip" or "markdown"
	IncludeMeta bool       `json:"include_meta,omitempty"`
}

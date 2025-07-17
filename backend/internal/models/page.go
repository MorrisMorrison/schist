package models

import (
	"path/filepath"
	"strings"
	"time"
)

type Page struct {
	MetaData *PageMetaData `json:"metaData"`
	Content  string        `json:"content"`
}

type PageMetaData struct {
	Slug    string    `yaml:"slug,omitempty" json:"slug,omitempty"`
	Title   string    `yaml:"title" json:"title"`
	Path    string    `yaml:"path" json:"path"`
	Created time.Time `yaml:"created" json:"created"`
	Updated time.Time `yaml:"updated" json:"updated"`
	Tags    []string  `yaml:"tags,omitempty" json:"tags,omitempty"`
}

func (p *PageMetaData) ParentPath() string {
	return filepath.Dir(p.Path)
}

func (p *PageMetaData) Depth() int {
	return strings.Count(p.Path, "/")
}

type Folder struct {
	Name       string    `json:"name"`
	Path       string    `json:"path"`
	Created    time.Time `json:"created"`
	PageCount  int       `json:"page_count"`
	SubFolders []Folder  `json:"sub_folders"`
}

func (f *Folder) ParentPath() string {
	return filepath.Dir(f.Path)
}

func (f *Folder) Depth() int {
	return strings.Count(f.Path, "/")
}

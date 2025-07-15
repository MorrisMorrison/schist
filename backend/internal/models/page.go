package models

import (
	"time"
)

type Page struct {
	MetaData *PageMetaData
	Content  string
}

type PageMetaData struct {
	Slug    string    `yaml:"slug,omitempty"`
	Title   string    `yaml:"title"`
	Created time.Time `yaml:"created"`
	Updated time.Time `yaml:"updated"`
	Tags    []string  `yaml:"tags,omitempty"`
}

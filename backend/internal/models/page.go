package models

import (
	"time"
)

type Page struct {
	MetaData *PageMetaData `json:"metaData"`
	Content  string        `json:"content"`
}

type PageMetaData struct {
	Slug    string    `yaml:"slug,omitempty" json:"slug,omitempty"`
	Title   string    `yaml:"title" json:"title"`
	Created time.Time `yaml:"created" json:"created"`
	Updated time.Time `yaml:"updated" json:"updated"`
	Tags    []string  `yaml:"tags,omitempty" json:"tags,omitempty"`
}

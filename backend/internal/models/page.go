package models

import (
	"time"
)

type Page struct {
	MetaData *PageMetaData
	Content  string
}

type PageMetaData struct {
	Slug     string
	Title    string
	Created  time.Time
	Modified time.Time
	Tags     []string
}

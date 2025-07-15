package utils

import (
	"regexp"
	"strings"
)

func GenerateSlug(title string) string {
	slug := strings.ToLower(title)
	slug = strings.ReplaceAll(slug, " ", "-")

	// remove common special characters
	slug = regexp.MustCompile(`[^\w\-]`).ReplaceAllString(slug, "")
	// remove multiple consecutive hyphens
	slug = regexp.MustCompile(`-+`).ReplaceAllString(slug, "-")

	slug = strings.Trim(slug, "-")

	if slug == "" {
		return "untitled"
	}

	return slug
}

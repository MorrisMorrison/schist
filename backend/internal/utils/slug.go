package utils

import "strings"

func GenerateSlug(title string) string {
	slug := strings.ToLower(title)
	slug = strings.ReplaceAll(slug, " ", "-")

	// remove common special characters
	slug = invalidSlugCharsRegex.ReplaceAllString(slug, "")
	slug = repeatedHyphensRegex.ReplaceAllString(slug, "-")

	slug = strings.Trim(slug, "-")

	if slug == "" {
		return "untitled"
	}

	return slug
}

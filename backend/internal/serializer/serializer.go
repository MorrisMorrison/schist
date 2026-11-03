package serializer

import (
	"bytes"
	"fmt"
	"sort"
	"strings"

	"github.com/MorrisMorrison/schist/internal/models"
	"gopkg.in/yaml.v2"
)

// DeserializeDocument parses raw file content (YAML front matter followed by
// the markdown body) into a Document. Both LF and CRLF line endings are
// accepted. The single blank line that SerializeDocument writes between the
// front matter and the body is not part of the content.
func DeserializeDocument(fileContent []byte) (*models.Document, error) {
	newline := "\n"
	if bytes.HasPrefix(fileContent, []byte("---\r\n")) {
		newline = "\r\n"
	}

	opening := []byte("---" + newline)
	if !bytes.HasPrefix(fileContent, opening) {
		return nil, fmt.Errorf("invalid document format: missing YAML frontmatter")
	}

	// split into metadata and content parts
	separator := []byte(newline + "---" + newline)
	parts := bytes.SplitN(fileContent[len(opening):], separator, 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid front matter format")
	}

	metaData, err := deserializeYAMLMetaData(parts[0])
	if err != nil {
		return nil, fmt.Errorf("invalid meta data: %w", err)
	}

	content := deserializeContent(bytes.TrimPrefix(parts[1], []byte(newline)))

	document := &models.Document{
		MetaData: metaData,
		Content:  content,
	}

	return document, nil
}

func deserializeYAMLMetaData(metaDataPart []byte) (*models.DocumentMetaData, error) {
	metaData := &models.DocumentMetaData{}
	if err := yaml.Unmarshal(metaDataPart, metaData); err != nil {
		return nil, fmt.Errorf("failed to parse front matter: %w", err)
	}

	var fields yaml.MapSlice
	if err := yaml.Unmarshal(metaDataPart, &fields); err != nil {
		return nil, fmt.Errorf("failed to parse front matter: %w", err)
	}
	for _, field := range fields {
		key := fmt.Sprint(field.Key)
		if IsKnownField(key) {
			continue
		}
		if metaData.Properties == nil {
			metaData.Properties = map[string]any{}
		}
		metaData.Properties[key] = NormalizeValue(field.Value)
	}

	return metaData, nil
}

// knownFields are the front matter keys Schist owns (models.DocumentMetaData).
var knownFields = map[string]bool{"slug": true, "title": true, "path": true, "created": true, "updated": true, "tags": true}

// IsKnownField reports whether key is one of Schist's own front matter keys
// rather than a custom property. Case is ignored, so a property can never
// shadow a field.
func IsKnownField(key string) bool {
	return knownFields[strings.ToLower(key)]
}

// NormalizeValue turns a value decoded from YAML into one that also encodes
// as JSON: YAML maps decode with interface{} keys, which encoding/json
// rejects, so maps become map[string]any (recursively).
func NormalizeValue(value any) any {
	switch v := value.(type) {
	case map[any]any:
		out := make(map[string]any, len(v))
		for key, item := range v {
			out[fmt.Sprint(key)] = NormalizeValue(item)
		}
		return out
	case yaml.MapSlice:
		out := make(map[string]any, len(v))
		for _, item := range v {
			out[fmt.Sprint(item.Key)] = NormalizeValue(item.Value)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = NormalizeValue(item)
		}
		return out
	default:
		return v
	}
}

func deserializeContent(contentPart []byte) string {
	return string(contentPart)
}

func SerializeDocument(document *models.Document) ([]byte, error) {
	metaData, err := serializeMetaData(document.MetaData)
	if err != nil {
		return nil, fmt.Errorf("could not serialize metadata: %w", err)
	}

	var buf bytes.Buffer
	buf.WriteString(string(metaData))
	buf.WriteString(document.Content)

	return buf.Bytes(), nil
}

func serializeMetaData(metaData *models.DocumentMetaData) ([]byte, error) {
	var buf bytes.Buffer

	buf.WriteString("---\n")

	yamlData, err := yaml.Marshal(metaData)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal metadata: %w", err)
	}

	buf.Write(yamlData)

	if properties := customProperties(metaData); len(properties) > 0 {
		propertyData, err := yaml.Marshal(properties)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal front matter properties: %w", err)
		}
		buf.Write(propertyData)
	}

	buf.WriteString("---\n\n")

	return buf.Bytes(), nil
}

// customProperties are the properties to write after Schist's own fields, in
// key order, leaving out any that would shadow a field.
func customProperties(metaData *models.DocumentMetaData) yaml.MapSlice {
	if metaData == nil {
		return nil
	}
	keys := make([]string, 0, len(metaData.Properties))
	for key := range metaData.Properties {
		if !IsKnownField(key) && strings.TrimSpace(key) != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	properties := make(yaml.MapSlice, 0, len(keys))
	for _, key := range keys {
		properties = append(properties, yaml.MapItem{Key: key, Value: metaData.Properties[key]})
	}
	return properties
}

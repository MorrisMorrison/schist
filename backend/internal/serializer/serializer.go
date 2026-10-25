package serializer

import (
	"bytes"
	"fmt"

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

	return metaData, nil
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

	buf.WriteString("---\n\n")

	return buf.Bytes(), nil
}

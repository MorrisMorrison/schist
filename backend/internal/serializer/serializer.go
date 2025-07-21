package serializer

import (
	"bytes"
	"fmt"

	"github.com/MorrisMorrison/schist/internal/models"
	"gopkg.in/yaml.v2"
)

// raw file content -> Page
func DeserializePage(fileContent []byte) (*models.Page, error) {
	if !bytes.HasPrefix(fileContent, []byte("---\n")) {
		return &models.Page{Content: string(fileContent)}, nil
	}

	// split into into metadata and content parts
	parts := bytes.SplitN(fileContent[4:], []byte("\n---\n"), 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid front matter format")
	}

	metaData, err := deserializeYAMLMetaData(parts[0])
	if err != nil {
		return nil, fmt.Errorf("invalid meta data")
	}

	content := deserializeContent(parts[1])

	page := &models.Page{
		MetaData: metaData,
		Content:  content,
	}

	return page, nil
}

func deserializeYAMLMetaData(metaDataPart []byte) (*models.PageMetaData, error) {
	metaData := &models.PageMetaData{}
	if err := yaml.Unmarshal(metaDataPart, metaData); err != nil {
		return nil, fmt.Errorf("failed to parse front matter: %w", err)
	}

	return metaData, nil
}

func deserializeContent(contentPart []byte) string {
	return string(contentPart)
}

// Page -> raw file content
func SerializePage(page *models.Page) ([]byte, error) {
	metaData, err := serializeMetaData(page.MetaData)
	if err != nil {
		return nil, fmt.Errorf("could not parse metadata")
	}

	var buf bytes.Buffer
	buf.WriteString(string(metaData))
	buf.WriteString(page.Content)

	return buf.Bytes(), nil
}

func serializeMetaData(metaData *models.PageMetaData) ([]byte, error) {
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

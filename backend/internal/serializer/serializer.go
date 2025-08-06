package serializer

import (
	"bytes"
	"fmt"

	"github.com/MorrisMorrison/schist/internal/models"
	"gopkg.in/yaml.v2"
)

// raw file content -> Document
func DeserializeDocument(fileContent []byte) (*models.Document, error) {
	if !bytes.HasPrefix(fileContent, []byte("---\n")) {
		return &models.Document{Content: string(fileContent)}, nil
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
		return nil, fmt.Errorf("could not parse metadata")
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

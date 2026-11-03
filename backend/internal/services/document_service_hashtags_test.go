package services_test

import (
	"testing"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Inline #hashtags become tags on every save, not only when the web editor
// extracts them, so pages written through the API, the MCP or an import are
// tagged the same way.
func TestDocumentService_InlineHashtagsBecomeTags(t *testing.T) {
	documentService := setupDocumentService(t, t.TempDir())

	t.Run("create adds hashtags to the explicit tags", func(t *testing.T) {
		doc := &models.Document{
			MetaData: &models.DocumentMetaData{Title: "Garden", Path: "/garden", Tags: []string{"outdoor"}},
			Content:  "# Garden\n\nNotes on #compost and #outdoor.\n\n```sh\n# a comment, #notatag\n```\n",
		}
		require.NoError(t, documentService.CreateDocument(doc))

		stored, err := documentService.GetDocumentByPath("/garden")
		require.NoError(t, err)
		assert.Equal(t, []string{"outdoor", "compost"}, stored.MetaData.Tags)

		counts, err := documentService.GetAllTags()
		require.NoError(t, err)
		assert.Equal(t, 1, counts["compost"])
		assert.NotContains(t, counts, "notatag")
	})

	t.Run("update adds hashtags from the new content", func(t *testing.T) {
		doc := &models.Document{
			MetaData: &models.DocumentMetaData{Title: "Log", Path: "/log"},
			Content:  "first entry",
		}
		require.NoError(t, documentService.CreateDocument(doc))

		doc.Content = "first entry\n\nsecond entry #done"
		require.NoError(t, documentService.UpdateDocumentWithSaveType(doc, "manual"))

		stored, err := documentService.GetDocumentByPath("/log")
		require.NoError(t, err)
		assert.Equal(t, []string{"done"}, stored.MetaData.Tags)
	})

	t.Run("content without hashtags keeps the explicit tags as they are", func(t *testing.T) {
		doc := &models.Document{
			MetaData: &models.DocumentMetaData{Title: "Plain", Path: "/plain", Tags: []string{"a", "b"}},
			Content:  "no tags here, see page#anchor",
		}
		require.NoError(t, documentService.CreateDocument(doc))

		stored, err := documentService.GetDocumentByPath("/plain")
		require.NoError(t, err)
		assert.Equal(t, []string{"a", "b"}, stored.MetaData.Tags)
	})
}

package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
)

func newVersionTestService(t *testing.T) *DocumentService {
	t.Helper()
	dataDir := t.TempDir()
	gitService, err := NewGitService(dataDir)
	require.NoError(t, err)
	return NewDocumentService(dataDir, gitService, NewIgnoreService(dataDir))
}

func seedPage(t *testing.T, d *DocumentService, path, content string) *models.Document {
	t.Helper()
	require.NoError(t, d.CreateDocument(&models.Document{
		MetaData: &models.DocumentMetaData{Title: "Plan", Path: path},
		Content:  content,
	}))
	doc, err := d.GetDocumentByPath(path)
	require.NoError(t, err)
	return doc
}

func TestGetDocumentByPath_ReturnsContentVersion(t *testing.T) {
	d := newVersionTestService(t)
	doc := seedPage(t, d, "/plan", "# Plan\n\nv1")
	assert.Len(t, doc.Version, 64, "hex sha256")

	again, err := d.GetDocumentByPath("/plan")
	require.NoError(t, err)
	assert.Equal(t, doc.Version, again.Version, "same bytes, same version")
}

func TestUpdateDocumentChecked(t *testing.T) {
	edit := func(doc *models.Document, content string) *models.Document {
		meta := *doc.MetaData
		return &models.Document{MetaData: &meta, Content: content}
	}

	t.Run("matching baseVersion saves", func(t *testing.T) {
		d := newVersionTestService(t)
		doc := seedPage(t, d, "/plan", "# Plan\n\nv1")
		require.NoError(t, d.UpdateDocumentChecked("/plan", edit(doc, "# Plan\n\nv2"), "manual", doc.Version))
		saved, _ := d.GetDocumentByPath("/plan")
		assert.Equal(t, "# Plan\n\nv2", saved.Content)
	})

	t.Run("stale baseVersion is refused with the current page", func(t *testing.T) {
		d := newVersionTestService(t)
		doc := seedPage(t, d, "/plan", "# Plan\n\nv1")
		require.NoError(t, d.UpdateDocumentWithSaveType(edit(doc, "# Plan\n\nfrom elsewhere"), "manual"))

		err := d.UpdateDocumentChecked("/plan", edit(doc, "# Plan\n\nmine"), "auto", doc.Version)
		var apiErr *apierrors.APIError
		require.ErrorAs(t, err, &apiErr)
		assert.Equal(t, apierrors.ErrCodeDocumentChanged, apiErr.Code)
		current := apiErr.Details["document"].(*models.Document)
		assert.Equal(t, "# Plan\n\nfrom elsewhere", current.Content)

		saved, _ := d.GetDocumentByPath("/plan")
		assert.Equal(t, "# Plan\n\nfrom elsewhere", saved.Content, "nothing overwritten")
	})

	t.Run("no baseVersion saves as before", func(t *testing.T) {
		d := newVersionTestService(t)
		doc := seedPage(t, d, "/plan", "# Plan\n\nv1")
		require.NoError(t, d.UpdateDocumentWithSaveType(edit(doc, "# Plan\n\nother"), "manual"))
		require.NoError(t, d.UpdateDocumentChecked("/plan", edit(doc, "# Plan\n\nmine"), "manual", ""))
		saved, _ := d.GetDocumentByPath("/plan")
		assert.Equal(t, "# Plan\n\nmine", saved.Content)
	})

	t.Run("a rename is checked against the old path", func(t *testing.T) {
		d := newVersionTestService(t)
		doc := seedPage(t, d, "/plan", "# Plan\n\nv1")
		renamed := edit(doc, "# Roadmap\n\nv1")
		renamed.MetaData.Path = "/roadmap"
		require.NoError(t, d.UpdateDocumentChecked("/plan", renamed, "manual", doc.Version))
		_, err := d.GetDocumentByPath("/roadmap")
		assert.NoError(t, err)
	})
}

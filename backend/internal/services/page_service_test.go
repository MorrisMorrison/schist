package services_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestDir(t *testing.T) (string, func()) {
	testDir, err := os.MkdirTemp("", "schist-test-*")
	require.NoError(t, err)

	cleanup := func() {
		os.RemoveAll(testDir)
	}

	return testDir, cleanup
}

func createTestPage() *models.Page {
	return &models.Page{
		MetaData: &models.PageMetaData{
			Title: "Test Page",
			Tags:  []string{"test", "example"},
		},
		Content: "# Test Page\n\nThis is test content.",
	}
}

func TestPageService_CreatePage(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	pageService := services.NewPageService(testDir)

	t.Run("creates page successfully", func(t *testing.T) {
		page := createTestPage()

		err := pageService.CreatePage(page)

		assert.NoError(t, err)
		assert.Equal(t, "test-page", page.MetaData.Slug)
		assert.False(t, page.MetaData.Created.IsZero())
		assert.False(t, page.MetaData.Updated.IsZero())

		// Verify file was created
		expectedPath := filepath.Join(testDir, "test-page.md")
		_, err = os.Stat(expectedPath)
		assert.NoError(t, err)
	})

	t.Run("generates slug from title", func(t *testing.T) {
		page := &models.Page{
			MetaData: &models.PageMetaData{
				Title: "Hello World!",
			},
			Content: "Test content",
		}

		err := pageService.CreatePage(page)

		assert.NoError(t, err)
		assert.Equal(t, "hello-world", page.MetaData.Slug)
	})

	t.Run("preserves existing slug", func(t *testing.T) {
		page := &models.Page{
			MetaData: &models.PageMetaData{
				Slug:  "custom-slug",
				Title: "Test Page",
			},
			Content: "Test content",
		}

		err := pageService.CreatePage(page)

		assert.NoError(t, err)
		assert.Equal(t, "custom-slug", page.MetaData.Slug)
	})

	t.Run("sets timestamps", func(t *testing.T) {
		before := time.Now()
		page := createTestPage()

		err := pageService.CreatePage(page)
		after := time.Now()

		assert.NoError(t, err)
		assert.True(t, page.MetaData.Created.After(before) || page.MetaData.Created.Equal(before))
		assert.True(t, page.MetaData.Created.Before(after) || page.MetaData.Created.Equal(after))
		assert.Equal(t, page.MetaData.Created, page.MetaData.Updated)
	})
}

func TestPageService_ReadPage(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	pageService := services.NewPageService(testDir)

	t.Run("reads existing page successfully", func(t *testing.T) {
		// Create a test page first
		originalPage := createTestPage()
		err := pageService.CreatePage(originalPage)
		require.NoError(t, err)

		// Read it back
		readPage, err := pageService.ReadPage(originalPage.MetaData.Slug)

		assert.NoError(t, err)
		assert.NotNil(t, readPage)
		assert.NotNil(t, readPage.MetaData)
		assert.Equal(t, originalPage.MetaData.Title, readPage.MetaData.Title)
		assert.Equal(t, "\n"+originalPage.Content, readPage.Content)
		assert.Equal(t, originalPage.MetaData.Tags, readPage.MetaData.Tags)
	})

	t.Run("returns error for non-existent page", func(t *testing.T) {
		_, err := pageService.ReadPage("non-existent")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "could not read file")
	})

	t.Run("handles page without front matter", func(t *testing.T) {
		// Create a simple markdown file without front matter
		simplePage := "# Simple Page\n\nJust content, no metadata."
		filePath := filepath.Join(testDir, "simple.md")
		err := os.WriteFile(filePath, []byte(simplePage), 0644)
		require.NoError(t, err)

		// Read the page without front matter
		page, err := pageService.ReadPage("simple")

		assert.NoError(t, err)
		assert.NotNil(t, page)
		assert.Equal(t, simplePage, page.Content)
		// Page without front matter should have nil or empty metadata
	})
}

func TestPageService_UpdatePage(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	pageService := services.NewPageService(testDir)

	t.Run("updates existing page", func(t *testing.T) {
		// Create original page
		originalPage := createTestPage()
		err := pageService.CreatePage(originalPage)
		require.NoError(t, err)

		// Update the page
		originalPage.MetaData.Title = "Updated Title"
		originalPage.Content = "# Updated Title\n\nUpdated content."
		originalCreated := originalPage.MetaData.Created

		err = pageService.UpdatePage(originalPage)

		assert.NoError(t, err)

		// Read back and verify
		updatedPage, err := pageService.ReadPage(originalPage.MetaData.Slug)
		require.NoError(t, err)

		assert.Equal(t, "Updated Title", updatedPage.MetaData.Title)
		assert.Equal(t, "\n# Updated Title\n\nUpdated content.", updatedPage.Content)
		assert.Equal(t, originalCreated.Unix(), updatedPage.MetaData.Created.Unix())
		assert.True(t, updatedPage.MetaData.Updated.After(originalCreated) || updatedPage.MetaData.Updated.Equal(originalCreated))
	})
}

func TestPageService_DeletePage(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	pageService := services.NewPageService(testDir)

	t.Run("deletes existing page", func(t *testing.T) {
		// Create a page first
		page := createTestPage()
		err := pageService.CreatePage(page)
		require.NoError(t, err)

		// Verify it exists
		expectedPath := filepath.Join(testDir, page.MetaData.Slug+".md")
		_, err = os.Stat(expectedPath)
		require.NoError(t, err)

		// Delete it
		err = pageService.DeletePage(page.MetaData.Slug)

		assert.NoError(t, err)

		// Verify it's gone
		_, err = os.Stat(expectedPath)
		assert.True(t, os.IsNotExist(err))
	})

	t.Run("returns error for non-existent page", func(t *testing.T) {
		err := pageService.DeletePage("non-existent")

		assert.Error(t, err)
	})
}

func TestPageService_ListPages(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	pageService := services.NewPageService(testDir)

	t.Run("lists all pages", func(t *testing.T) {
		// Create multiple pages
		page1 := &models.Page{
			MetaData: &models.PageMetaData{Title: "Page One"},
			Content:  "Content one",
		}
		page2 := &models.Page{
			MetaData: &models.PageMetaData{Title: "Page Two"},
			Content:  "Content two",
		}
		page3 := &models.Page{
			MetaData: &models.PageMetaData{Title: "Page Three"},
			Content:  "Content three",
		}

		err := pageService.CreatePage(page1)
		require.NoError(t, err)
		err = pageService.CreatePage(page2)
		require.NoError(t, err)
		err = pageService.CreatePage(page3)
		require.NoError(t, err)

		// List pages
		pages, err := pageService.ListPages()

		assert.NoError(t, err)
		assert.Len(t, pages, 3)

		// Verify all pages are present
		titles := make([]string, len(pages))
		for i, page := range pages {
			titles[i] = page.MetaData.Title
		}
		assert.Contains(t, titles, "Page One")
		assert.Contains(t, titles, "Page Two")
		assert.Contains(t, titles, "Page Three")
	})

	t.Run("returns empty list for no pages", func(t *testing.T) {
		// Ensure test directory is empty
		files, err := os.ReadDir(testDir)
		require.NoError(t, err)
		for _, file := range files {
			if !file.IsDir() {
				os.Remove(filepath.Join(testDir, file.Name()))
			}
		}

		pages, err := pageService.ListPages()

		assert.NoError(t, err)
		assert.Empty(t, pages)
	})

	t.Run("ignores non-markdown files", func(t *testing.T) {
		// Create a markdown file and a non-markdown file
		page := createTestPage()
		err := pageService.CreatePage(page)
		require.NoError(t, err)

		// Create a non-markdown file
		txtFile := filepath.Join(testDir, "readme.txt")
		err = os.WriteFile(txtFile, []byte("This is a text file"), 0644)
		require.NoError(t, err)

		// List pages should only return markdown files
		pages, err := pageService.ListPages()

		assert.NoError(t, err)
		assert.Len(t, pages, 1) // Only the markdown file should be included
		if len(pages) > 0 {
			assert.Equal(t, "Test Page", pages[0].MetaData.Title)
		}
	})

	t.Run("ignores directories", func(t *testing.T) {
		// Create a subdirectory in test dir
		subDir := filepath.Join(testDir, "subdir")
		err := os.MkdirAll(subDir, 0755)
		require.NoError(t, err)

		// Create a page
		page := createTestPage()
		err = pageService.CreatePage(page)
		require.NoError(t, err)

		// List pages should ignore directories
		pages, err := pageService.ListPages()

		assert.NoError(t, err)
		assert.Len(t, pages, 1) // Only the markdown file should be included
		if len(pages) > 0 {
			assert.Equal(t, "Test Page", pages[0].MetaData.Title)
		}
	})
}

func TestPageService_BuildFilePath(t *testing.T) {
	// Note: buildFilePath is not exported, so we test it indirectly through other methods
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	pageService := services.NewPageService(testDir)

	t.Run("creates correct file path", func(t *testing.T) {
		page := &models.Page{
			MetaData: &models.PageMetaData{
				Slug:  "test-slug",
				Title: "Test Page",
			},
			Content: "Test content",
		}

		err := pageService.CreatePage(page)
		assert.NoError(t, err)

		// Verify file was created at correct path
		expectedPath := filepath.Join(testDir, "test-slug.md")
		_, err = os.Stat(expectedPath)
		assert.NoError(t, err)
	})
}

func TestPageService_ErrorCases(t *testing.T) {
	t.Run("invalid data directory", func(t *testing.T) {
		// Create file service with invalid directory
		pageService := services.NewPageService("/invalid/path/that/does/not/exist")

		page := createTestPage()
		err := pageService.CreatePage(page)

		assert.Error(t, err)
	})

	t.Run("read-only directory", func(t *testing.T) {
		testDir, cleanup := setupTestDir(t)
		defer cleanup()

		// Make directory read-only
		err := os.Chmod(testDir, 0444)
		require.NoError(t, err)

		// Restore permissions for cleanup
		defer func() {
			os.Chmod(testDir, 0755)
		}()

		pageService := services.NewPageService(testDir)
		page := createTestPage()

		err = pageService.CreatePage(page)
		assert.Error(t, err)
	})
}

func TestPageService_Integration(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	pageService := services.NewPageService(testDir)

	t.Run("full CRUD workflow", func(t *testing.T) {
		// Create
		page := createTestPage()
		err := pageService.CreatePage(page)
		require.NoError(t, err)

		slug := page.MetaData.Slug

		// Read
		readPage, err := pageService.ReadPage(slug)
		assert.NoError(t, err)
		assert.Equal(t, page.MetaData.Title, readPage.MetaData.Title)

		// Update
		readPage.MetaData.Title = "Updated Title"
		readPage.Content = "Updated content"
		err = pageService.UpdatePage(readPage)
		assert.NoError(t, err)

		// Read again to verify update
		updatedPage, err := pageService.ReadPage(slug)
		assert.NoError(t, err)
		assert.Equal(t, "Updated Title", updatedPage.MetaData.Title)
		assert.Equal(t, "\nUpdated content", updatedPage.Content)

		// Delete
		err = pageService.DeletePage(slug)
		assert.NoError(t, err)

		// Verify deletion
		_, err = pageService.ReadPage(slug)
		assert.Error(t, err)
	})
}

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
		err := os.WriteFile(filePath, []byte(simplePage), 0600)
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
		err = os.WriteFile(txtFile, []byte("This is a text file"), 0600)
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

func TestPageService_RenameFolder(t *testing.T) {
	testDir, cleanup := setupTestDir(t)
	defer cleanup()

	pageService := services.NewPageService(testDir)

	t.Run("successfully renames empty folder", func(t *testing.T) {
		// Create a folder
		folderPath := "/test-folder"
		err := pageService.CreateFolder(folderPath)
		require.NoError(t, err)

		// Rename the folder
		err = pageService.RenameFolder(folderPath, "renamed-folder")
		assert.NoError(t, err)

		// Verify old folder is gone
		oldPath := filepath.Join(testDir, "test-folder")
		_, err = os.Stat(oldPath)
		assert.True(t, os.IsNotExist(err))

		// Verify new folder exists
		newPath := filepath.Join(testDir, "renamed-folder")
		_, err = os.Stat(newPath)
		assert.NoError(t, err)
	})

	t.Run("successfully renames folder with pages", func(t *testing.T) {
		// Create a folder
		folderPath := "/docs"
		err := pageService.CreateFolder(folderPath)
		require.NoError(t, err)

		// Create pages in the folder
		page1 := &models.Page{
			MetaData: &models.PageMetaData{
				Title: "Page One",
				Path:  "/docs/page-one",
				Slug:  "page-one",
			},
			Content: "Content for page one",
		}
		page2 := &models.Page{
			MetaData: &models.PageMetaData{
				Title: "Page Two",
				Path:  "/docs/page-two",
				Slug:  "page-two",
			},
			Content: "Content for page two",
		}

		err = pageService.CreatePage(page1)
		require.NoError(t, err)
		err = pageService.CreatePage(page2)
		require.NoError(t, err)

		// Rename the folder
		err = pageService.RenameFolder("/docs", "documentation")
		assert.NoError(t, err)

		// Verify old folder is gone
		oldPath := filepath.Join(testDir, "docs")
		_, err = os.Stat(oldPath)
		assert.True(t, os.IsNotExist(err))

		// Verify new folder exists
		newPath := filepath.Join(testDir, "documentation")
		_, err = os.Stat(newPath)
		assert.NoError(t, err)

		// Verify pages were moved and their metadata updated
		updatedPage1, err := pageService.GetPageByPath("/documentation/page-one")
		assert.NoError(t, err)
		assert.Equal(t, "/documentation/page-one", updatedPage1.MetaData.Path)
		assert.Equal(t, "page-one", updatedPage1.MetaData.Slug)
		assert.Equal(t, "Page One", updatedPage1.MetaData.Title)

		updatedPage2, err := pageService.GetPageByPath("/documentation/page-two")
		assert.NoError(t, err)
		assert.Equal(t, "/documentation/page-two", updatedPage2.MetaData.Path)
		assert.Equal(t, "page-two", updatedPage2.MetaData.Slug)
		assert.Equal(t, "Page Two", updatedPage2.MetaData.Title)

		// Verify old page paths no longer exist
		_, err = pageService.GetPageByPath("/docs/page-one")
		assert.Error(t, err)
		_, err = pageService.GetPageByPath("/docs/page-two")
		assert.Error(t, err)
	})

	t.Run("successfully renames nested folder with pages", func(t *testing.T) {
		// Create nested folder structure
		err := pageService.CreateFolder("/parent")
		require.NoError(t, err)
		err = pageService.CreateFolder("/parent/child")
		require.NoError(t, err)

		// Create a page in the nested folder
		page := &models.Page{
			MetaData: &models.PageMetaData{
				Title: "Nested Page",
				Path:  "/parent/child/nested-page",
				Slug:  "nested-page",
			},
			Content: "Content for nested page",
		}
		err = pageService.CreatePage(page)
		require.NoError(t, err)

		// Rename the child folder
		err = pageService.RenameFolder("/parent/child", "renamed-child")
		assert.NoError(t, err)

		// Verify old folder is gone
		oldPath := filepath.Join(testDir, "parent", "child")
		_, err = os.Stat(oldPath)
		assert.True(t, os.IsNotExist(err))

		// Verify new folder exists
		newPath := filepath.Join(testDir, "parent", "renamed-child")
		_, err = os.Stat(newPath)
		assert.NoError(t, err)

		// Verify page metadata was updated
		updatedPage, err := pageService.GetPageByPath("/parent/renamed-child/nested-page")
		assert.NoError(t, err)
		assert.Equal(t, "/parent/renamed-child/nested-page", updatedPage.MetaData.Path)
		assert.Equal(t, "nested-page", updatedPage.MetaData.Slug)
		assert.Equal(t, "Nested Page", updatedPage.MetaData.Title)

		// Verify old page path no longer exists
		_, err = pageService.GetPageByPath("/parent/child/nested-page")
		assert.Error(t, err)
	})

	t.Run("updates multiple pages with path prefix matching", func(t *testing.T) {
		// Create folders with similar names to test path prefix matching
		err := pageService.CreateFolder("/api")
		require.NoError(t, err)
		err = pageService.CreateFolder("/api-docs")
		require.NoError(t, err)

		// Create pages in both folders
		apiPage := &models.Page{
			MetaData: &models.PageMetaData{
				Title: "API Page",
				Path:  "/api/endpoint",
				Slug:  "endpoint",
			},
			Content: "API endpoint documentation",
		}
		docsPage := &models.Page{
			MetaData: &models.PageMetaData{
				Title: "Docs Page",
				Path:  "/api-docs/getting-started",
				Slug:  "getting-started",
			},
			Content: "Getting started documentation",
		}

		err = pageService.CreatePage(apiPage)
		require.NoError(t, err)
		err = pageService.CreatePage(docsPage)
		require.NoError(t, err)

		// Rename /api folder
		err = pageService.RenameFolder("/api", "endpoints")
		assert.NoError(t, err)

		// Verify only the /api page was affected, not /api-docs
		updatedApiPage, err := pageService.GetPageByPath("/endpoints/endpoint")
		assert.NoError(t, err)
		assert.Equal(t, "/endpoints/endpoint", updatedApiPage.MetaData.Path)

		// Verify /api-docs page was not affected
		unchangedDocsPage, err := pageService.GetPageByPath("/api-docs/getting-started")
		assert.NoError(t, err)
		assert.Equal(t, "/api-docs/getting-started", unchangedDocsPage.MetaData.Path)
	})

	t.Run("fails to rename non-existent folder", func(t *testing.T) {
		err := pageService.RenameFolder("/non-existent", "new-name")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "folder does not exist")
	})

	t.Run("fails to rename root folder", func(t *testing.T) {
		err := pageService.RenameFolder("/", "new-name")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "cannot rename root folder")
	})

	t.Run("fails with empty new name", func(t *testing.T) {
		// Create a folder first
		err := pageService.CreateFolder("/test")
		require.NoError(t, err)

		err = pageService.RenameFolder("/test", "")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "new folder name cannot be empty")
	})

	t.Run("fails with invalid new name containing slash", func(t *testing.T) {
		// Create a folder first
		err := pageService.CreateFolder("/test")
		require.NoError(t, err)

		err = pageService.RenameFolder("/test", "invalid/name")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "folder name cannot contain '/' character")
	})

	t.Run("fails when destination folder already exists", func(t *testing.T) {
		// Create two folders
		err := pageService.CreateFolder("/folder1")
		require.NoError(t, err)
		err = pageService.CreateFolder("/folder2")
		require.NoError(t, err)

		// Try to rename folder1 to folder2 (which already exists)
		err = pageService.RenameFolder("/folder1", "folder2")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "folder already exists")
	})

	t.Run("fails with invalid old path", func(t *testing.T) {
		err := pageService.RenameFolder("", "new-name")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid folder path")
	})

	t.Run("updates page timestamps on rename", func(t *testing.T) {
		// Create folder and page
		err := pageService.CreateFolder("/timestest")
		require.NoError(t, err)

		page := &models.Page{
			MetaData: &models.PageMetaData{
				Title: "Timestamp Test",
				Path:  "/timestest/page",
				Slug:  "page",
			},
			Content: "Test content",
		}
		err = pageService.CreatePage(page)
		require.NoError(t, err)

		// Get original timestamp
		originalPage, err := pageService.GetPageByPath("/timestest/page")
		require.NoError(t, err)
		originalUpdated := originalPage.MetaData.Updated

		// Small delay to ensure timestamp difference
		time.Sleep(10 * time.Millisecond)

		// Rename folder
		err = pageService.RenameFolder("/timestest", "renamed-timestest")
		assert.NoError(t, err)

		// Verify updated timestamp changed
		updatedPage, err := pageService.GetPageByPath("/renamed-timestest/page")
		assert.NoError(t, err)
		assert.True(t, updatedPage.MetaData.Updated.After(originalUpdated))
	})

	t.Run("handles folder with subfolder correctly", func(t *testing.T) {
		// Create nested structure
		err := pageService.CreateFolder("/main")
		require.NoError(t, err)
		err = pageService.CreateFolder("/main/sub1")
		require.NoError(t, err)
		err = pageService.CreateFolder("/main/sub2")
		require.NoError(t, err)

		// Create pages in different levels
		mainPage := &models.Page{
			MetaData: &models.PageMetaData{
				Title: "Main Page",
				Path:  "/main/main-page",
				Slug:  "main-page",
			},
			Content: "Main content",
		}
		sub1Page := &models.Page{
			MetaData: &models.PageMetaData{
				Title: "Sub1 Page",
				Path:  "/main/sub1/sub1-page",
				Slug:  "sub1-page",
			},
			Content: "Sub1 content",
		}
		sub2Page := &models.Page{
			MetaData: &models.PageMetaData{
				Title: "Sub2 Page",
				Path:  "/main/sub2/sub2-page",
				Slug:  "sub2-page",
			},
			Content: "Sub2 content",
		}

		err = pageService.CreatePage(mainPage)
		require.NoError(t, err)
		err = pageService.CreatePage(sub1Page)
		require.NoError(t, err)
		err = pageService.CreatePage(sub2Page)
		require.NoError(t, err)

		// Rename main folder
		err = pageService.RenameFolder("/main", "primary")
		assert.NoError(t, err)

		// Verify all pages and subfolders were moved
		_, err = pageService.GetPageByPath("/primary/main-page")
		assert.NoError(t, err)
		_, err = pageService.GetPageByPath("/primary/sub1/sub1-page")
		assert.NoError(t, err)
		_, err = pageService.GetPageByPath("/primary/sub2/sub2-page")
		assert.NoError(t, err)

		// Verify subfolders exist
		newMainPath := filepath.Join(testDir, "primary")
		newSub1Path := filepath.Join(testDir, "primary", "sub1")
		newSub2Path := filepath.Join(testDir, "primary", "sub2")

		_, err = os.Stat(newMainPath)
		assert.NoError(t, err)
		_, err = os.Stat(newSub1Path)
		assert.NoError(t, err)
		_, err = os.Stat(newSub2Path)
		assert.NoError(t, err)
	})
}

func TestPageService_MoveFolder(t *testing.T) {
	t.Run("successfully moves folder to different parent", func(t *testing.T) {
		testDir := t.TempDir()
		pageService := services.NewPageService(testDir)

		// Create folder structure: /source/child-folder with a page
		sourceDir := filepath.Join(testDir, "source")
		childDir := filepath.Join(sourceDir, "child-folder")
		targetDir := filepath.Join(testDir, "target")

		err := os.MkdirAll(childDir, 0755)
		require.NoError(t, err)
		err = os.MkdirAll(targetDir, 0755)
		require.NoError(t, err)

		// Create a page in the child folder
		testPage := &models.Page{
			MetaData: &models.PageMetaData{
				Title: "Test Page",
				Path:  "/source/child-folder/test-page",
				Slug:  "test-page",
			},
			Content: "Test content",
		}
		err = pageService.CreatePage(testPage)
		require.NoError(t, err)

		// Move /source/child-folder to /target/child-folder
		err = pageService.MoveFolder("/source/child-folder", "/target/child-folder")
		assert.NoError(t, err)

		// Verify the folder was moved physically
		oldPath := filepath.Join(testDir, "source", "child-folder")
		newPath := filepath.Join(testDir, "target", "child-folder")

		_, err = os.Stat(oldPath)
		assert.True(t, os.IsNotExist(err), "Old folder should not exist")

		_, err = os.Stat(newPath)
		assert.NoError(t, err, "New folder should exist")

		// Verify the page metadata was updated
		movedPage, err := pageService.GetPageByPath("/target/child-folder/test-page")
		assert.NoError(t, err)
		assert.Equal(t, "/target/child-folder/test-page", movedPage.MetaData.Path)
		assert.Equal(t, "test-page", movedPage.MetaData.Slug)
		assert.Contains(t, movedPage.Content, "Test content")
	})

	t.Run("fails to move folder into itself", func(t *testing.T) {
		testDir := t.TempDir()
		pageService := services.NewPageService(testDir)

		// Create folder structure
		sourceDir := filepath.Join(testDir, "parent")
		childDir := filepath.Join(sourceDir, "child")
		err := os.MkdirAll(childDir, 0755)
		require.NoError(t, err)

		// Try to move parent into child (circular reference)
		err = pageService.MoveFolder("/parent", "/parent/child/parent")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "cannot move folder into itself")
	})

	t.Run("fails to move non-existent folder", func(t *testing.T) {
		testDir := t.TempDir()
		pageService := services.NewPageService(testDir)

		err := pageService.MoveFolder("/non-existent", "/target/folder")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "folder does not exist")
	})

	t.Run("fails to move to existing destination", func(t *testing.T) {
		testDir := t.TempDir()
		pageService := services.NewPageService(testDir)

		// Create both source and destination folders
		sourceDir := filepath.Join(testDir, "source")
		targetDir := filepath.Join(testDir, "target", "source")
		err := os.MkdirAll(sourceDir, 0755)
		require.NoError(t, err)
		err = os.MkdirAll(targetDir, 0755)
		require.NoError(t, err)

		err = pageService.MoveFolder("/source", "/target/source")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "destination folder already exists")
	})

	t.Run("fails to move root folder", func(t *testing.T) {
		testDir := t.TempDir()
		pageService := services.NewPageService(testDir)

		err := pageService.MoveFolder("/", "/target")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "cannot move root folder")
	})
}

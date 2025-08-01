package services_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/serializer"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupGitTestDir(t *testing.T) (string, func()) {
	testDir, err := os.MkdirTemp("", "schist-git-test-*")
	require.NoError(t, err)

	cleanup := func() {
		os.RemoveAll(testDir)
	}

	return testDir, cleanup
}

func createTestDocument(path, title, content string) *models.Document {
	return &models.Document{
		MetaData: &models.DocumentMetaData{
			Title: title,
			Path:  path,
			Slug:  strings.ToLower(strings.ReplaceAll(title, " ", "-")),
			Tags:  []string{"test", "git"},
		},
		Content: content,
	}
}

func writeTestDocumentToFile(t *testing.T, testDir, docPath string, document *models.Document) {
	// Create directory structure if needed
	filePath := filepath.Join(testDir, docPath+".md")
	dir := filepath.Dir(filePath)
	if dir != testDir {
		err := os.MkdirAll(dir, 0755)
		require.NoError(t, err)
	}

	// Serialize and write the document
	content, err := serializer.SerializeDocument(document)
	require.NoError(t, err)

	err = os.WriteFile(filePath, content, 0644)
	require.NoError(t, err)
}

func TestNewGitService(t *testing.T) {
	t.Run("initializes new git repository successfully", func(t *testing.T) {
		testDir, cleanup := setupGitTestDir(t)
		defer cleanup()

		gitService, err := services.NewGitService(testDir)

		assert.NoError(t, err)
		assert.NotNil(t, gitService)

		// Verify .git directory was created
		gitDir := filepath.Join(testDir, ".git")
		_, err = os.Stat(gitDir)
		assert.NoError(t, err)

		// Verify .gitignore was created with initial commit
		gitignorePath := filepath.Join(testDir, ".gitignore")
		_, err = os.Stat(gitignorePath)
		assert.NoError(t, err)
	})

	t.Run("opens existing git repository successfully", func(t *testing.T) {
		testDir, cleanup := setupGitTestDir(t)
		defer cleanup()

		// Create first git service to initialize repository
		_, err := services.NewGitService(testDir)
		require.NoError(t, err)

		// Create second git service to open existing repository
		gitService2, err := services.NewGitService(testDir)

		assert.NoError(t, err)
		assert.NotNil(t, gitService2)
	})

	t.Run("handles invalid directory path", func(t *testing.T) {
		invalidPath := "/invalid/path/that/does/not/exist"

		_, err := services.NewGitService(invalidPath)

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to initialize git repository")
	})

	t.Run("handles permission denied directory", func(t *testing.T) {
		testDir, cleanup := setupGitTestDir(t)
		defer cleanup()

		// Make directory read-only
		err := os.Chmod(testDir, 0444)
		require.NoError(t, err)

		// Restore permissions for cleanup
		defer func() {
			os.Chmod(testDir, 0755)
		}()

		_, err = services.NewGitService(testDir)

		assert.Error(t, err)
	})
}

func TestGitService_CommitDocument(t *testing.T) {
	testDir, cleanup := setupGitTestDir(t)
	defer cleanup()

	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	t.Run("commits new document with auto-generated message", func(t *testing.T) {
		docPath := "/test-document"
		page := createTestDocument(docPath, "Test Document", "# Test Document\n\nThis is test content.")
		writeTestDocumentToFile(t, testDir, "test-document", page)

		err := gitService.CommitDocument(docPath, "")

		assert.NoError(t, err)

		// Verify commit was created by checking version history
		versions, err := gitService.GetDocumentVersions(docPath)
		assert.NoError(t, err)
		assert.Len(t, versions, 1)
		assert.Contains(t, versions[0].Message, "Update document: "+docPath)
	})

	t.Run("commits document with custom message", func(t *testing.T) {
		docPath := "/custom-message-doc"
		customMessage := "feat: add custom message document"
		page := createTestDocument(docPath, "Custom Message Doc", "# Custom Message Doc\n\nCustom content.")
		writeTestDocumentToFile(t, testDir, "custom-message-doc", page)

		err := gitService.CommitDocument(docPath, customMessage)

		assert.NoError(t, err)

		// Verify custom message was used
		versions, err := gitService.GetDocumentVersions(docPath)
		assert.NoError(t, err)
		assert.Len(t, versions, 1)
		assert.Equal(t, customMessage, versions[0].Message)
	})

	t.Run("commits document updates", func(t *testing.T) {
		docPath := "/update-test-doc"

		// Create and commit initial version
		initialPage := createTestDocument(docPath, "Update Test", "# Initial Content")
		writeTestDocumentToFile(t, testDir, "update-test-doc", initialPage)
		err := gitService.CommitDocument(docPath, "Initial commit")
		require.NoError(t, err)

		// Update and commit new version
		updatedPage := createTestDocument(docPath, "Update Test", "# Updated Content\n\nThis content was updated.")
		writeTestDocumentToFile(t, testDir, "update-test-doc", updatedPage)
		err = gitService.CommitDocument(docPath, "Update content")

		assert.NoError(t, err)

		// Verify two versions exist
		versions, err := gitService.GetDocumentVersions(docPath)
		assert.NoError(t, err)
		assert.Len(t, versions, 2)
		assert.Equal(t, "Update content", versions[0].Message) // Most recent first
		assert.Equal(t, "Initial commit", versions[1].Message)
	})

	testCases := []struct {
		name     string
		docPath  string
		title    string
		content  string
		expected string
	}{
		{
			name:     "simple document path",
			docPath:  "/simple",
			title:    "Simple Document",
			content:  "Simple content",
			expected: "simple.md",
		},
		{
			name:     "nested document path",
			docPath:  "/folder/nested-doc",
			title:    "Nested Document",
			content:  "Nested content",
			expected: "folder/nested-doc.md",
		},
		{
			name:     "deep nested path",
			docPath:  "/docs/api/v1/endpoints",
			title:    "API Endpoints",
			content:  "API documentation",
			expected: "docs/api/v1/endpoints.md",
		},
		{
			name:     "root level document",
			docPath:  "/index",
			title:    "Index Page",
			content:  "Index content",
			expected: "index.md",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			page := createTestDocument(tc.docPath, tc.title, tc.content)

			// Create necessary directory structure
			relPath := strings.TrimPrefix(tc.docPath, "/")
			writeTestDocumentToFile(t, testDir, relPath, page)

			err := gitService.CommitDocument(tc.docPath, "Test commit for "+tc.name)

			assert.NoError(t, err)

			// Verify document can be retrieved
			versions, err := gitService.GetDocumentVersions(tc.docPath)
			assert.NoError(t, err)
			assert.Len(t, versions, 1)
			assert.Equal(t, tc.docPath, versions[0].FilePath)
		})
	}

	t.Run("handles non-existent document file", func(t *testing.T) {
		err := gitService.CommitDocument("/non-existent", "Commit non-existent file")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to add file to staging")
	})
}

func TestGitService_GetDocumentVersions(t *testing.T) {
	testDir, cleanup := setupGitTestDir(t)
	defer cleanup()

	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	t.Run("retrieves version history for document with multiple commits", func(t *testing.T) {
		docPath := "/version-history-test"

		// Create multiple versions
		versions := []struct {
			content string
			message string
		}{
			{"# Version 1\n\nInitial content", "Initial version"},
			{"# Version 2\n\nUpdated content", "Second version"},
			{"# Version 3\n\nFinal content", "Final version"},
		}

		for i, version := range versions {
			page := createTestDocument(docPath, "Version History Test", version.content)
			writeTestDocumentToFile(t, testDir, "version-history-test", page)

			err := gitService.CommitDocument(docPath, version.message)
			require.NoError(t, err)

			// Small delay to ensure different timestamps
			if i < len(versions)-1 {
				time.Sleep(10 * time.Millisecond)
			}
		}

		// Retrieve version history
		history, err := gitService.GetDocumentVersions(docPath)

		assert.NoError(t, err)
		assert.Len(t, history, 3)

		// Verify versions are in reverse chronological order (newest first)
		assert.Equal(t, "Final version", history[0].Message)
		assert.Equal(t, "Second version", history[1].Message)
		assert.Equal(t, "Initial version", history[2].Message)

		// Verify all versions have required metadata
		for _, v := range history {
			assert.NotEmpty(t, v.Hash)
			assert.NotEmpty(t, v.Author)
			assert.False(t, v.Timestamp.IsZero())
			assert.Equal(t, docPath, v.FilePath)
		}

		// Verify timestamps are in correct order
		assert.True(t, history[0].Timestamp.After(history[1].Timestamp) || history[0].Timestamp.Equal(history[1].Timestamp))
		assert.True(t, history[1].Timestamp.After(history[2].Timestamp) || history[1].Timestamp.Equal(history[2].Timestamp))
	})

	t.Run("handles non-existent document gracefully", func(t *testing.T) {
		versions, err := gitService.GetDocumentVersions("/non-existent-document")

		assert.NoError(t, err)
		assert.Empty(t, versions)
	})

	t.Run("returns empty history for untracked document", func(t *testing.T) {
		// Create a file but don't commit it
		page := createTestDocument("/untracked", "Untracked Document", "Untracked content")
		writeTestDocumentToFile(t, testDir, "untracked", page)

		versions, err := gitService.GetDocumentVersions("/untracked")

		assert.NoError(t, err) // go-git returns empty slice for files not in history
		assert.Empty(t, versions)
	})

	t.Run("verifies author and signature information", func(t *testing.T) {
		docPath := "/author-test"
		page := createTestDocument(docPath, "Author Test", "# Author Test")
		writeTestDocumentToFile(t, testDir, "author-test", page)

		err := gitService.CommitDocument(docPath, "Test author commit")
		require.NoError(t, err)

		versions, err := gitService.GetDocumentVersions(docPath)

		assert.NoError(t, err)
		assert.Len(t, versions, 1)
		assert.Equal(t, "Schist User", versions[0].Author)
		assert.NotEmpty(t, versions[0].Hash)
		assert.Len(t, versions[0].Hash, 40) // SHA-1 hash length
	})
}

func TestGitService_GetDocumentAtVersion(t *testing.T) {
	testDir, cleanup := setupGitTestDir(t)
	defer cleanup()

	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	// Setup test documents with version history
	docPath := "/version-retrieval-test"
	var commitHashes []string

	versions := []struct {
		title   string
		content string
		message string
	}{
		{"Version One", "# Version One\n\nFirst version content", "Add version one"},
		{"Version Two", "# Version Two\n\nSecond version content", "Add version two"},
		{"Version Three", "# Version Three\n\nThird version content", "Add version three"},
	}

	// Create version history
	for _, version := range versions {
		page := createTestDocument(docPath, version.title, version.content)
		writeTestDocumentToFile(t, testDir, "version-retrieval-test", page)

		err := gitService.CommitDocument(docPath, version.message)
		require.NoError(t, err)

		// Get the commit hash for this version
		history, err := gitService.GetDocumentVersions(docPath)
		require.NoError(t, err)
		commitHashes = append(commitHashes, history[0].Hash) // Append normally - newer commits at end
	}

	t.Run("retrieves document at specific version", func(t *testing.T) {
		// Test retrieving each version
		for i, expectedVersion := range versions {
			page, err := gitService.GetDocumentAtVersion(docPath, commitHashes[i])

			assert.NoError(t, err)
			assert.NotNil(t, page)
			assert.NotNil(t, page.MetaData)
			assert.Equal(t, expectedVersion.title, page.MetaData.Title)
			assert.Contains(t, page.Content, expectedVersion.content)
		}
	})

	t.Run("retrieves latest version correctly", func(t *testing.T) {
		latestHash := commitHashes[len(commitHashes)-1] // Last commit hash is Version Three
		page, err := gitService.GetDocumentAtVersion(docPath, latestHash)

		assert.NoError(t, err)
		assert.Equal(t, "Version Three", page.MetaData.Title)
		assert.Contains(t, page.Content, "Third version content")
	})

	t.Run("retrieves first version correctly", func(t *testing.T) {
		firstHash := commitHashes[0] // First commit hash is Version One
		page, err := gitService.GetDocumentAtVersion(docPath, firstHash)

		assert.NoError(t, err)
		assert.Equal(t, "Version One", page.MetaData.Title)
		assert.Contains(t, page.Content, "First version content")
	})

	t.Run("handles invalid commit hash", func(t *testing.T) {
		invalidHash := "0123456789abcdef0123456789abcdef01234567"

		_, err := gitService.GetDocumentAtVersion(docPath, invalidHash)

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get commit object")
	})

	t.Run("handles malformed commit hash", func(t *testing.T) {
		malformedHash := "invalid-hash"

		_, err := gitService.GetDocumentAtVersion(docPath, malformedHash)

		assert.Error(t, err)
	})

	t.Run("handles non-existent file at valid commit", func(t *testing.T) {
		// Use a valid commit hash but request a file that doesn't exist at that commit
		validHash := commitHashes[0]

		_, err := gitService.GetDocumentAtVersion("/non-existent-file", validHash)

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get file from tree")
	})

	t.Run("properly deserializes complex page metadata", func(t *testing.T) {
		complexDocPath := "/complex-metadata-test"
		complexDocument := &models.Document{
			MetaData: &models.DocumentMetaData{
				Title:   "Complex Metadata Test",
				Path:    complexDocPath,
				Slug:    "complex-metadata-test",
				Tags:    []string{"complex", "metadata", "serialization", "test"},
				Created: time.Now().Truncate(time.Second),
				Updated: time.Now().Truncate(time.Second),
			},
			Content: "# Complex Metadata Test\n\nThis document has complex metadata for testing serialization.",
		}

		writeTestDocumentToFile(t, testDir, "complex-metadata-test", complexDocument)
		err := gitService.CommitDocument(complexDocPath, "Add complex metadata test")
		require.NoError(t, err)

		// Get the commit hash
		history, err := gitService.GetDocumentVersions(complexDocPath)
		require.NoError(t, err)
		require.Len(t, history, 1)

		// Retrieve the document at this version
		retrievedPage, err := gitService.GetDocumentAtVersion(complexDocPath, history[0].Hash)

		assert.NoError(t, err)
		assert.Equal(t, complexDocument.MetaData.Title, retrievedPage.MetaData.Title)
		assert.Equal(t, complexDocument.MetaData.Path, retrievedPage.MetaData.Path)
		assert.Equal(t, complexDocument.MetaData.Slug, retrievedPage.MetaData.Slug)
		assert.Equal(t, complexDocument.MetaData.Tags, retrievedPage.MetaData.Tags)
		assert.Contains(t, retrievedPage.Content, "complex metadata for testing")
	})
}

func TestGitService_ErrorHandling(t *testing.T) {
	t.Run("handles uninitialized repository error", func(t *testing.T) {
		testDir, cleanup := setupGitTestDir(t)
		defer cleanup()

		// Create a GitService instance but don't initialize it properly
		// This would require modifying the GitService to allow testing uninitialized state
		// For now, we'll test the public interface behavior
		gitService, err := services.NewGitService(testDir)
		require.NoError(t, err)

		// Remove the .git directory to simulate corruption
		gitDir := filepath.Join(testDir, ".git")
		err = os.RemoveAll(gitDir)
		require.NoError(t, err)

		// Now operations should fail gracefully
		err = gitService.CommitDocument("/test", "test commit")
		assert.Error(t, err)
	})

	t.Run("handles file system permissions", func(t *testing.T) {
		testDir, cleanup := setupGitTestDir(t)
		defer cleanup()

		gitService, err := services.NewGitService(testDir)
		require.NoError(t, err)

		// Create a document first
		docPath := "/permission-test"
		page := createTestDocument(docPath, "Permission Test", "Test content")
		writeTestDocumentToFile(t, testDir, "permission-test", page)

		err = gitService.CommitDocument(docPath, "Initial commit")
		require.NoError(t, err)

		// Make the directory read-only after committing
		err = os.Chmod(testDir, 0444)
		require.NoError(t, err)

		// Restore permissions for cleanup
		defer func() {
			os.Chmod(testDir, 0755)
		}()

		// Try to commit another change - this should fail due to permissions
		// First restore permissions temporarily to write the file
		os.Chmod(testDir, 0755)
		updatedPage := createTestDocument(docPath, "Permission Test Updated", "Updated content")
		writeTestDocumentToFile(t, testDir, "permission-test", updatedPage)
		os.Chmod(testDir, 0444) // Make read-only again

		err = gitService.CommitDocument(docPath, "Update after permission change")
		// Should fail due to read-only directory
		assert.Error(t, err)
	})
}

func TestGitService_Integration(t *testing.T) {
	testDir, cleanup := setupGitTestDir(t)
	defer cleanup()

	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	t.Run("full workflow integration test", func(t *testing.T) {
		docPath := "/integration-test"

		// Step 1: Create and commit initial document
		initialPage := createTestDocument(docPath, "Integration Test", "# Integration Test\n\nInitial content for integration testing.")
		writeTestDocumentToFile(t, testDir, "integration-test", initialPage)

		err := gitService.CommitDocument(docPath, "Initial integration test document")
		assert.NoError(t, err)

		// Step 2: Update and commit document
		updatedPage := createTestDocument(docPath, "Integration Test Updated", "# Integration Test Updated\n\nUpdated content with more details.")
		writeTestDocumentToFile(t, testDir, "integration-test", updatedPage)

		err = gitService.CommitDocument(docPath, "Update integration test document")
		assert.NoError(t, err)

		// Step 3: Get version history
		versions, err := gitService.GetDocumentVersions(docPath)
		assert.NoError(t, err)
		assert.Len(t, versions, 2)

		// Verify version order and messages
		assert.Equal(t, "Update integration test document", versions[0].Message)
		assert.Equal(t, "Initial integration test document", versions[1].Message)

		// Step 4: Retrieve document at each version
		// Get latest version
		latestDoc, err := gitService.GetDocumentAtVersion(docPath, versions[0].Hash)
		assert.NoError(t, err)
		assert.Equal(t, "Integration Test Updated", latestDoc.MetaData.Title)
		assert.Contains(t, latestDoc.Content, "Updated content with more details")

		// Get initial version
		initialDoc, err := gitService.GetDocumentAtVersion(docPath, versions[1].Hash)
		assert.NoError(t, err)
		assert.Equal(t, "Integration Test", initialDoc.MetaData.Title)
		assert.Contains(t, initialDoc.Content, "Initial content for integration testing")
	})

	t.Run("multiple documents with interleaved commits", func(t *testing.T) {
		documents := []struct {
			path    string
			title   string
			content string
		}{
			{"/doc-a", "Document A", "Content for document A"},
			{"/doc-b", "Document B", "Content for document B"},
			{"/folder/doc-c", "Document C", "Content for document C"},
		}

		// Create and commit all documents
		for i, doc := range documents {
			page := createTestDocument(doc.path, doc.title, doc.content)

			// Handle nested paths
			fileName := strings.TrimPrefix(doc.path, "/")
			writeTestDocumentToFile(t, testDir, fileName, page)

			err := gitService.CommitDocument(doc.path, fmt.Sprintf("Add %s", doc.title))
			assert.NoError(t, err)

			// Small delay to ensure different timestamps
			if i < len(documents)-1 {
				time.Sleep(10 * time.Millisecond)
			}
		}

		// Update documents in different order
		updateOrder := []int{1, 0, 2} // B, A, C
		for i, docIndex := range updateOrder {
			doc := documents[docIndex]
			updatedPage := createTestDocument(doc.path, doc.title+" Updated", doc.content+" - Updated")

			fileName := strings.TrimPrefix(doc.path, "/")
			writeTestDocumentToFile(t, testDir, fileName, updatedPage)

			err := gitService.CommitDocument(doc.path, fmt.Sprintf("Update %s", doc.title))
			assert.NoError(t, err)

			if i < len(updateOrder)-1 {
				time.Sleep(10 * time.Millisecond)
			}
		}

		// Verify each document has correct version history
		for _, doc := range documents {
			versions, err := gitService.GetDocumentVersions(doc.path)
			assert.NoError(t, err)
			assert.Len(t, versions, 2, "Document %s should have 2 versions", doc.path)

			// Verify messages
			assert.Contains(t, versions[0].Message, "Update", "Latest version should be update for %s", doc.path)
			assert.Contains(t, versions[1].Message, "Add", "First version should be add for %s", doc.path)
		}
	})

	t.Run("complex folder structure with nested documents", func(t *testing.T) {
		nestedDocs := []struct {
			path    string
			title   string
			content string
		}{
			{"/", "Root Document", "Root level content"},
			{"/docs/readme", "Documentation README", "Documentation overview"},
			{"/docs/api/auth", "Authentication API", "Auth API documentation"},
			{"/docs/api/users", "Users API", "Users API documentation"},
			{"/guides/quickstart", "Quick Start Guide", "Getting started quickly"},
			{"/guides/advanced/deployment", "Deployment Guide", "Advanced deployment strategies"},
		}

		// Create and commit all nested documents
		for _, doc := range nestedDocs {
			page := createTestDocument(doc.path, doc.title, doc.content)

			// Convert path to file path
			fileName := strings.TrimPrefix(doc.path, "/")
			if fileName == "" {
				fileName = "index"
			}
			writeTestDocumentToFile(t, testDir, fileName, page)

			err := gitService.CommitDocument(doc.path, fmt.Sprintf("Add %s", doc.title))
			assert.NoError(t, err)

			time.Sleep(5 * time.Millisecond) // Small delay for timestamp differences
		}

		// Verify all documents are tracked and retrievable
		for _, doc := range nestedDocs {
			versions, err := gitService.GetDocumentVersions(doc.path)
			assert.NoError(t, err, "Should be able to get versions for %s", doc.path)
			assert.Len(t, versions, 1, "Document %s should have 1 version", doc.path)

			// Retrieve the document content
			retrievedDoc, err := gitService.GetDocumentAtVersion(doc.path, versions[0].Hash)
			assert.NoError(t, err, "Should be able to retrieve %s", doc.path)
			assert.Equal(t, doc.title, retrievedDoc.MetaData.Title)
			assert.Contains(t, retrievedDoc.Content, doc.content)
		}
	})
}

func TestGitService_CompareVersions(t *testing.T) {
	testDir, cleanup := setupGitTestDir(t)
	defer cleanup()

	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	docPath := "/diff-test"

	// Create initial version
	initialPage := createTestDocument(docPath, "Diff Test", "# Diff Test\n\nLine 1\nLine 2\nLine 3")
	writeTestDocumentToFile(t, testDir, "diff-test", initialPage)
	err = gitService.CommitDocument(docPath, "Initial version")
	require.NoError(t, err)

	// Get first commit hash
	versions, err := gitService.GetDocumentVersions(docPath)
	require.NoError(t, err)
	require.Len(t, versions, 1)
	hash1 := versions[0].Hash

	// Create updated version
	updatedPage := createTestDocument(docPath, "Diff Test Updated", "# Diff Test Updated\n\nLine 1 modified\nLine 2\nLine 4\nNew line 5")
	writeTestDocumentToFile(t, testDir, "diff-test", updatedPage)
	err = gitService.CommitDocument(docPath, "Updated version")
	require.NoError(t, err)

	// Get second commit hash
	versions, err = gitService.GetDocumentVersions(docPath)
	require.NoError(t, err)
	require.Len(t, versions, 2)
	hash2 := versions[0].Hash // Most recent commit

	t.Run("compares two versions successfully", func(t *testing.T) {
		diff, err := gitService.CompareVersions(docPath, hash1, hash2)

		assert.NoError(t, err)
		assert.NotNil(t, diff)
		assert.Equal(t, docPath, diff.DocumentPath)
		assert.Equal(t, hash1, diff.Hash1)
		assert.Equal(t, hash2, diff.Hash2)
		assert.NotEmpty(t, diff.Lines)

		// Verify summary has counts
		assert.Greater(t, diff.Summary.Additions, 0)
		assert.Greater(t, diff.Summary.Deletions, 0)
	})

	t.Run("handles invalid commit hash gracefully", func(t *testing.T) {
		invalidHash := "0123456789abcdef0123456789abcdef01234567"

		_, err := gitService.CompareVersions(docPath, hash1, invalidHash)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "commit does not exist in repository")
	})

	t.Run("handles non-existent document", func(t *testing.T) {
		_, err := gitService.CompareVersions("/non-existent", hash1, hash2)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get content for hash1")
	})

	t.Run("compares identical versions", func(t *testing.T) {
		diff, err := gitService.CompareVersions(docPath, hash1, hash1)

		assert.NoError(t, err)
		assert.NotNil(t, diff)
		assert.Equal(t, 0, diff.Summary.Additions)
		assert.Equal(t, 0, diff.Summary.Deletions)
		assert.Equal(t, 0, diff.Summary.Modifications)
	})
}

func TestGitService_RestoreDocument(t *testing.T) {
	testDir, cleanup := setupGitTestDir(t)
	defer cleanup()

	gitService, err := services.NewGitService(testDir)
	require.NoError(t, err)

	docPath := "/restore-test"

	// Create version history
	versions := []struct {
		title   string
		content string
		message string
	}{
		{"Version One", "# Version One\n\nOriginal content", "Add version one"},
		{"Version Two", "# Version Two\n\nModified content", "Add version two"},
		{"Version Three", "# Version Three\n\nFinal content", "Add version three"},
	}

	var commitHashes []string
	for _, version := range versions {
		page := createTestDocument(docPath, version.title, version.content)
		writeTestDocumentToFile(t, testDir, "restore-test", page)

		err := gitService.CommitDocument(docPath, version.message)
		require.NoError(t, err)

		// Get commit hash
		history, err := gitService.GetDocumentVersions(docPath)
		require.NoError(t, err)
		commitHashes = append(commitHashes, history[0].Hash)
	}

	t.Run("restores document to previous version", func(t *testing.T) {
		// Current document should be Version Three
		currentPage, err := gitService.GetDocumentAtVersion(docPath, commitHashes[2])
		require.NoError(t, err)
		assert.Equal(t, "Version Three", currentPage.MetaData.Title)

		// Restore to Version One
		err = gitService.RestoreDocument(docPath, commitHashes[0])
		assert.NoError(t, err)

		// Verify current document is now Version One content by reading from filesystem
		filePath := filepath.Join(testDir, "restore-test.md")
		content, err := os.ReadFile(filePath)
		require.NoError(t, err)

		restoredDocument, err := serializer.DeserializeDocument(content)
		require.NoError(t, err)
		assert.Contains(t, restoredDocument.Content, "Original content")

		// Verify a new commit was created
		history, err := gitService.GetDocumentVersions(docPath)
		require.NoError(t, err)
		assert.Len(t, history, 4) // Original 3 + 1 restore commit

		// Verify restore commit message
		assert.Contains(t, history[0].Message, "Restore document to version")
		assert.Contains(t, history[0].Message, "Add version one")
	})

	t.Run("handles invalid commit hash", func(t *testing.T) {
		invalidHash := "0123456789abcdef0123456789abcdef01234567"

		err := gitService.RestoreDocument(docPath, invalidHash)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get document content from commit")
	})

	t.Run("handles non-existent document", func(t *testing.T) {
		err := gitService.RestoreDocument("/non-existent", commitHashes[0])
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get document content from commit")
	})

	t.Run("creates meaningful commit message with short hash", func(t *testing.T) {
		// Restore to Version Two
		err := gitService.RestoreDocument(docPath, commitHashes[1])
		require.NoError(t, err)

		// Check commit message format
		history, err := gitService.GetDocumentVersions(docPath)
		require.NoError(t, err)

		restoreMessage := history[0].Message
		shortHash := commitHashes[1][:7]
		assert.Contains(t, restoreMessage, fmt.Sprintf("Restore document to version %s", shortHash))
		assert.Contains(t, restoreMessage, "Add version two")
	})
}

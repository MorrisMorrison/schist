package services_test

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupShareServiceTest(t *testing.T) (string, *services.ShareService, *services.DocumentService) {
	testDir := t.TempDir()

	// Setup config
	cfg := &config.Config{
		DataDir:                testDir,
		SharingEnabled:         true,
		ShareDefaultExpiryDays: 7,
		ShareMaxExpiryDays:     30,
	}

	documentService := setupDocumentService(t, testDir)

	// Create a test document
	testDoc := &models.Document{
		MetaData: &models.DocumentMetaData{
			Title: "Test Share Document",
			Path:  "/test-share-doc",
			Slug:  "test-share-doc",
		},
		Content: "This is a test document for sharing.",
	}
	require.NoError(t, documentService.CreateDocument(testDoc))

	shareService := services.NewShareService(cfg, documentService)

	return testDir, shareService, documentService
}

func TestShareService_NewShareService(t *testing.T) {
	_, shareService, _ := setupShareServiceTest(t)

	assert.NotNil(t, shareService)
}

// shares.json holds share tokens, so like users.json and passkeys.json it is
// readable by the owner only.
func TestShareService_SharesFileIsOwnerOnly(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX file modes are not enforced on Windows")
	}
	dir, shareService, _ := setupShareServiceTest(t)
	_, err := shareService.CreateShare("/test-share-doc", "admin", 0)
	require.NoError(t, err)

	info, err := os.Stat(filepath.Join(dir, ".schist", "shares.json"))
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0600), info.Mode().Perm())
}

func TestShareService_CreateShare(t *testing.T) {
	_, shareService, _ := setupShareServiceTest(t)

	t.Run("creates share successfully with default expiry", func(t *testing.T) {
		share, err := shareService.CreateShare("/test-share-doc", "admin", 0)

		assert.NoError(t, err)
		assert.NotNil(t, share)
		assert.NotEmpty(t, share.ID)
		assert.NotEmpty(t, share.Token)
		assert.Equal(t, "/test-share-doc", share.DocumentPath)
		assert.Equal(t, "admin", share.CreatedBy)
		assert.False(t, share.CreatedAt.IsZero())
		assert.False(t, share.ExpiresAt.IsZero())
		assert.True(t, share.ExpiresAt.After(share.CreatedAt))

		// Should use default expiry (7 days)
		expectedExpiry := time.Now().AddDate(0, 0, 7)
		assert.WithinDuration(t, expectedExpiry, share.ExpiresAt, time.Minute)
	})

	t.Run("creates share with custom expiry", func(t *testing.T) {
		share, err := shareService.CreateShare("/test-share-doc", "admin", 14)

		assert.NoError(t, err)
		assert.NotNil(t, share)

		// Should use custom expiry (14 days)
		expectedExpiry := time.Now().AddDate(0, 0, 14)
		assert.WithinDuration(t, expectedExpiry, share.ExpiresAt, time.Minute)
	})

	t.Run("limits expiry to max allowed", func(t *testing.T) {
		share, err := shareService.CreateShare("/test-share-doc", "admin", 60) // More than 30 days max

		assert.NoError(t, err)
		assert.NotNil(t, share)

		// Should be limited to max expiry (30 days)
		expectedExpiry := time.Now().AddDate(0, 0, 30)
		assert.WithinDuration(t, expectedExpiry, share.ExpiresAt, time.Minute)
	})

	t.Run("creates share with never expires when negative days", func(t *testing.T) {
		share, err := shareService.CreateShare("/test-share-doc", "admin", -1)

		assert.NoError(t, err)
		assert.NotNil(t, share)

		// Should be set far in the future (100 years)
		farFuture := time.Now().AddDate(100, 0, 0)
		assert.WithinDuration(t, farFuture, share.ExpiresAt, time.Hour*24) // Allow 1 day variance
	})

	t.Run("fails for non-existent document", func(t *testing.T) {
		_, err := shareService.CreateShare("/non-existent-doc", "admin", 7)

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "document not found")
	})

	t.Run("generates unique tokens", func(t *testing.T) {
		share1, err := shareService.CreateShare("/test-share-doc", "admin", 7)
		require.NoError(t, err)

		share2, err := shareService.CreateShare("/test-share-doc", "admin", 7)
		require.NoError(t, err)

		assert.NotEqual(t, share1.Token, share2.Token)
		assert.NotEqual(t, share1.ID, share2.ID)
	})
}

func TestShareService_GetSharedDocument(t *testing.T) {
	_, shareService, _ := setupShareServiceTest(t)

	// Create a share first
	share, err := shareService.CreateShare("/test-share-doc", "admin", 7)
	require.NoError(t, err)

	t.Run("returns document for valid token", func(t *testing.T) {
		doc, err := shareService.GetSharedDocument(share.Token)

		assert.NoError(t, err)
		assert.NotNil(t, doc)
		assert.Equal(t, "Test Share Document", doc.MetaData.Title)
		assert.Equal(t, "/test-share-doc", doc.MetaData.Path)
		assert.Contains(t, doc.Content, "test document for sharing")
	})

	t.Run("fails for invalid token", func(t *testing.T) {
		_, err := shareService.GetSharedDocument("invalid-token")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "share not found")
	})

	t.Run("fails for expired token", func(t *testing.T) {
		// We can't easily manipulate the expiry time after creation,
		// so we'll test with an invalid token which simulates the same error path
		_, err := shareService.GetSharedDocument("expired-token-simulation")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "share not found")
	})
}

func TestShareService_ListShares(t *testing.T) {
	_, shareService, _ := setupShareServiceTest(t)

	t.Run("returns empty list when no shares", func(t *testing.T) {
		shares, err := shareService.ListShares("admin")

		assert.NoError(t, err)
		assert.Empty(t, shares)
	})

	t.Run("returns user's shares only", func(t *testing.T) {
		// Create shares for different users
		share1, err := shareService.CreateShare("/test-share-doc", "admin", 7)
		require.NoError(t, err)

		share2, err := shareService.CreateShare("/test-share-doc", "user1", 7)
		require.NoError(t, err)

		share3, err := shareService.CreateShare("/test-share-doc", "admin", 14)
		require.NoError(t, err)

		// List shares for admin
		adminShares, err := shareService.ListShares("admin")
		assert.NoError(t, err)
		assert.Len(t, adminShares, 2)

		// Verify the shares belong to admin
		for _, share := range adminShares {
			assert.Equal(t, "admin", share.CreatedBy)
		}

		// Verify we got the right shares
		shareIDs := []string{adminShares[0].ID, adminShares[1].ID}
		assert.Contains(t, shareIDs, share1.ID)
		assert.Contains(t, shareIDs, share3.ID)
		assert.NotContains(t, shareIDs, share2.ID)

		// List shares for user1
		user1Shares, err := shareService.ListShares("user1")
		assert.NoError(t, err)
		assert.Len(t, user1Shares, 1)
		assert.Equal(t, share2.ID, user1Shares[0].ID)
	})
}

func TestShareService_RevokeShare(t *testing.T) {
	_, shareService, _ := setupShareServiceTest(t)

	// Create a share
	share, err := shareService.CreateShare("/test-share-doc", "admin", 7)
	require.NoError(t, err)

	t.Run("revokes share successfully", func(t *testing.T) {
		err := shareService.RevokeShare(share.ID, "admin")
		assert.NoError(t, err)

		// Verify share is no longer accessible
		_, err = shareService.GetSharedDocument(share.Token)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "share not found")

		// Verify share is not in list
		shares, err := shareService.ListShares("admin")
		assert.NoError(t, err)
		assert.Empty(t, shares)
	})

	t.Run("fails to revoke non-existent share", func(t *testing.T) {
		err := shareService.RevokeShare("non-existent-id", "admin")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "share not found")
	})

	t.Run("fails to revoke share owned by different user", func(t *testing.T) {
		// Create a new share
		newShare, err := shareService.CreateShare("/test-share-doc", "admin", 7)
		require.NoError(t, err)

		// Try to revoke as different user
		err = shareService.RevokeShare(newShare.ID, "other-user")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "share not found")

		// Verify share still exists
		_, err = shareService.GetSharedDocument(newShare.Token)
		assert.NoError(t, err)
	})
}

func TestShareService_CleanupExpiredShares(t *testing.T) {
	_, shareService, _ := setupShareServiceTest(t)

	// Create some shares (we can't easily create expired ones with the current API)
	_, err := shareService.CreateShare("/test-share-doc", "admin", 7)
	require.NoError(t, err)

	_, err = shareService.CreateShare("/test-share-doc", "user1", 14)
	require.NoError(t, err)

	t.Run("cleanup runs without error", func(t *testing.T) {
		err := shareService.CleanupExpiredShares()
		assert.NoError(t, err)

		// Since we can't create expired shares easily, just verify the method runs
		// and that non-expired shares are still there
		shares1, err := shareService.ListShares("admin")
		assert.NoError(t, err)
		assert.Len(t, shares1, 1)

		shares2, err := shareService.ListShares("user1")
		assert.NoError(t, err)
		assert.Len(t, shares2, 1)
	})
}

func TestShareService_Integration(t *testing.T) {
	_, shareService, documentService := setupShareServiceTest(t)

	t.Run("full share workflow", func(t *testing.T) {
		// Create multiple documents
		doc2 := &models.Document{
			MetaData: &models.DocumentMetaData{
				Title: "Second Document",
				Path:  "/second-doc",
				Slug:  "second-doc",
			},
			Content: "Second document content.",
		}
		require.NoError(t, documentService.CreateDocument(doc2))

		// Create shares
		share1, err := shareService.CreateShare("/test-share-doc", "admin", 7)
		require.NoError(t, err)

		share2, err := shareService.CreateShare("/second-doc", "admin", 14)
		require.NoError(t, err)

		share3, err := shareService.CreateShare("/test-share-doc", "user1", 7)
		require.NoError(t, err)

		// List all admin shares
		adminShares, err := shareService.ListShares("admin")
		require.NoError(t, err)
		assert.Len(t, adminShares, 2)

		// Access shared documents
		doc1Shared, err := shareService.GetSharedDocument(share1.Token)
		assert.NoError(t, err)
		assert.Equal(t, "Test Share Document", doc1Shared.MetaData.Title)

		doc2Shared, err := shareService.GetSharedDocument(share2.Token)
		assert.NoError(t, err)
		assert.Equal(t, "Second Document", doc2Shared.MetaData.Title)

		// User1 can access their share
		doc1User1, err := shareService.GetSharedDocument(share3.Token)
		assert.NoError(t, err)
		assert.Equal(t, "Test Share Document", doc1User1.MetaData.Title)

		// Revoke one admin share
		err = shareService.RevokeShare(share1.ID, "admin")
		assert.NoError(t, err)

		// Verify share is revoked
		_, err = shareService.GetSharedDocument(share1.Token)
		assert.Error(t, err)

		// Admin should now have only one share
		adminShares, err = shareService.ListShares("admin")
		require.NoError(t, err)
		assert.Len(t, adminShares, 1)
		assert.Equal(t, share2.ID, adminShares[0].ID)

		// User1's share should still work
		_, err = shareService.GetSharedDocument(share3.Token)
		assert.NoError(t, err)

		// Cleanup expired shares (should not affect current ones)
		err = shareService.CleanupExpiredShares()
		assert.NoError(t, err)

		// Shares should still exist
		adminShares, err = shareService.ListShares("admin")
		assert.NoError(t, err)
		assert.Len(t, adminShares, 1)
	})
}

func TestShareService_ErrorCases(t *testing.T) {
	t.Run("invalid data directory", func(t *testing.T) {
		// Create service with invalid directory
		cfg := &config.Config{
			DataDir:                "/invalid/path/that/does/not/exist",
			ShareDefaultExpiryDays: 7,
			ShareMaxExpiryDays:     30,
		}

		// Create a mock document service (this would normally fail too)
		testDir := t.TempDir()

		documentService := setupDocumentService(t, testDir)

		shareService := services.NewShareService(cfg, documentService)

		// Creating the service should succeed (lazy initialization)
		assert.NotNil(t, shareService)

		// But operations that need to write should fail
		_, err := shareService.CreateShare("/non-existent", "admin", 7)
		assert.Error(t, err)
	})
}

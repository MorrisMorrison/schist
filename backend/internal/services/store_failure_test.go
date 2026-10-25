package services_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/config"
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/services"
)

// A store file that cannot be parsed must surface as an error and must never
// be replaced: overwriting it would silently drop every user / share in it.

func TestUserService_CorruptStoreIsNeverOverwritten(t *testing.T) {
	dir := t.TempDir()
	usersFile := filepath.Join(dir, "users.json")
	require.NoError(t, os.WriteFile(usersFile, []byte("{corrupt"), 0600))
	us := services.NewUserService(dir)

	first, err := us.IsFirstSetup()
	assert.Error(t, err)
	assert.False(t, first, "an unreadable store must not look like a fresh install")

	assert.Error(t, us.CreateFirstUser("mallory", "cred"))
	assert.Error(t, us.CreateUser("bob", false, "cred"))
	assert.Error(t, us.DeleteUser("alice"))
	assert.Error(t, us.UpdateLastLogin("alice"))
	assert.Error(t, us.AddPasskeyToUser("alice", "cred-2"))
	_, err = us.GetUserByUsername("alice")
	assert.Error(t, err)
	_, err = us.GetUserByCredentialID("cred")
	assert.Error(t, err)
	_, err = us.ListUsers()
	assert.Error(t, err)

	data, err := os.ReadFile(usersFile)
	require.NoError(t, err)
	assert.Equal(t, "{corrupt", string(data))
}

func TestUserService_StoreIsWrittenAtomicallyWithOwnerOnlyPermissions(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "data")
	us := services.NewUserService(dir)
	require.NoError(t, us.CreateFirstUser("admin", "cred-1"), "the data dir is created on first write")

	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	for _, e := range entries {
		assert.NotContains(t, e.Name(), ".tmp", "no temp file may be left behind")
	}
	if os.PathSeparator == '/' {
		info, err := os.Stat(filepath.Join(dir, "users.json"))
		require.NoError(t, err)
		assert.Equal(t, os.FileMode(0600), info.Mode().Perm())
	}
}

func newShareTestService(t *testing.T) (*services.ShareService, *services.DocumentService, string) {
	t.Helper()
	ds, dir := newSafetyDocumentService(t)
	mustCreate(t, ds, "/shared", "Shared", "hello")
	require.NoError(t, os.MkdirAll(filepath.Join(dir, ".schist"), 0755))
	ss := services.NewShareService(&config.Config{
		DataDir: dir, SharingEnabled: true, ShareDefaultExpiryDays: 7, ShareMaxExpiryDays: 30,
	}, ds)
	return ss, ds, dir
}

func TestShareService_CorruptStoreIsNeverOverwritten(t *testing.T) {
	ss, _, dir := newShareTestService(t)
	sharesFile := filepath.Join(dir, ".schist", "shares.json")
	require.NoError(t, os.WriteFile(sharesFile, []byte("[{broken"), 0600))

	_, err := ss.CreateShare("/shared", "admin", 1)
	assert.Error(t, err)
	_, err = ss.GetSharedDocument("token")
	assert.Error(t, err)
	assert.False(t, apierrors.IsAPIError(err), "a broken store is an internal error, not a 404")
	_, err = ss.ListShares("admin")
	assert.Error(t, err)
	assert.Error(t, ss.RevokeShare("id", "admin"))
	assert.Error(t, ss.CleanupExpiredShares())

	data, err := os.ReadFile(sharesFile)
	require.NoError(t, err)
	assert.Equal(t, "[{broken", string(data))
}

func TestShareService_EmptyStoreFile(t *testing.T) {
	ss, _, dir := newShareTestService(t)
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".schist", "shares.json"), nil, 0600))

	shares, err := ss.ListShares("admin")
	require.NoError(t, err)
	assert.Empty(t, shares)
	share, err := ss.CreateShare("/shared", "admin", 1)
	require.NoError(t, err)
	assert.Len(t, share.Token, 64)
}

func TestShareService_LookupEdgeCases(t *testing.T) {
	t.Run("expired share is indistinguishable from an unknown token", func(t *testing.T) {
		ss, _, dir := newShareTestService(t)
		expired := []services.ShareToken{{
			ID: "1", DocumentPath: "/shared", Token: "tok", CreatedBy: "admin",
			CreatedAt: time.Now().Add(-48 * time.Hour), ExpiresAt: time.Now().Add(-time.Hour),
		}}
		data, err := json.Marshal(expired)
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(filepath.Join(dir, ".schist", "shares.json"), data, 0600))

		_, err = ss.GetSharedDocument("tok")
		assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))
	})

	t.Run("share of a deleted note is not found", func(t *testing.T) {
		ss, ds, _ := newShareTestService(t)
		share, err := ss.CreateShare("/shared", "admin", 1)
		require.NoError(t, err)
		require.NoError(t, ds.DeleteDocument("/shared"))

		_, err = ss.GetSharedDocument(share.Token)
		assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))
	})

	t.Run("share of an unreadable note is an internal error", func(t *testing.T) {
		ss, _, dir := newShareTestService(t)
		share, err := ss.CreateShare("/shared", "admin", 1)
		require.NoError(t, err)
		require.NoError(t, os.Remove(filepath.Join(dir, "shared.md")))
		require.NoError(t, os.Mkdir(filepath.Join(dir, "shared.md"), 0755))

		_, err = ss.GetSharedDocument(share.Token)
		require.Error(t, err)
		assert.False(t, apierrors.IsAPIError(err))

		_, err = ss.CreateShare("/shared", "admin", 1)
		require.Error(t, err)
		assert.False(t, apierrors.IsAPIError(err))
	})

	t.Run("expiry defaults, caps and never-expires", func(t *testing.T) {
		ss, _, _ := newShareTestService(t)
		tests := []struct {
			days int
			min  time.Duration
			max  time.Duration
		}{
			{0, 6 * 24 * time.Hour, 8 * 24 * time.Hour},     // default 7 days
			{365, 29 * 24 * time.Hour, 31 * 24 * time.Hour}, // capped at 30
			{-1, 99 * 365 * 24 * time.Hour, 1 << 62},        // never expires
		}
		for _, tt := range tests {
			share, err := ss.CreateShare("/shared", "admin", tt.days)
			require.NoError(t, err)
			remaining := time.Until(share.ExpiresAt)
			assert.True(t, remaining > tt.min && remaining < tt.max, "days=%d remaining=%v", tt.days, remaining)
		}
	})
}

func TestLinkService_WhenDocumentsCannotBeListed(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "gone")
	ds := services.NewDocumentService(missing, nil, services.NewIgnoreService(missing))
	ls := services.NewLinkService(ds, services.NewIgnoreService(missing))

	_, err := ls.GetBacklinks("/a")
	assert.Error(t, err)
	_, err = ls.GetBrokenLinks()
	assert.Error(t, err)
	links := ls.ParseWikiLinks("see [[Some Title]]")
	require.Len(t, links, 1)
	assert.False(t, links[0].IsValid)
}

func TestLinkService_PathValidationAndMissingPages(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	ls := services.NewLinkService(ds, services.NewIgnoreService(t.TempDir()))

	_, err := ls.GetBacklinks("../etc")
	assert.Error(t, err)
	assert.Error(t, ls.UpdateBacklinks("../etc"))
	_, err = ls.GetOutgoingLinks("/missing")
	assert.Error(t, err)
	assert.Error(t, ls.UpdateBacklinks("/missing"))

	backlinks, err := ls.GetBacklinks("/nobody-links-here")
	require.NoError(t, err)
	assert.NotNil(t, backlinks)
	assert.Empty(t, backlinks)
}

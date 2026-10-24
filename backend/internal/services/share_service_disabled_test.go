package services_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/config"
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/services"
)

// SCHIST_SHARING_ENABLED=false must actually turn public sharing off.
func TestShareService_SharingDisabled(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	mustCreate(t, ds, "/doc", "Doc", "secret")

	enabled := services.NewShareService(&config.Config{
		DataDir: dir, SharingEnabled: true, ShareDefaultExpiryDays: 7, ShareMaxExpiryDays: 30,
	}, ds)
	share, err := enabled.CreateShare("/doc", "admin", 7)
	require.NoError(t, err)

	disabled := services.NewShareService(&config.Config{
		DataDir: dir, SharingEnabled: false, ShareDefaultExpiryDays: 7, ShareMaxExpiryDays: 30,
	}, ds)

	_, err = disabled.CreateShare("/doc", "admin", 7)
	assert.Equal(t, apierrors.ErrCodeForbidden, apiErrorCode(err))

	// An existing token must stop working and must not reveal that it exists.
	_, err = disabled.GetSharedDocument(share.Token)
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))

	// Owners can still see and revoke what was shared before.
	shares, err := disabled.ListShares("admin")
	require.NoError(t, err)
	require.Len(t, shares, 1)
	assert.NoError(t, disabled.RevokeShare(share.ID, "admin"))
}

package services_test

import (
	stderrors "errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
)

func TestDocumentService_VersionEndpointsRejectBadPaths(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	hash := "0123456789abcdef0123456789abcdef01234567"

	for _, p := range []string{"/../outside", "/a/../../b", "/has space"} {
		t.Run(p, func(t *testing.T) {
			_, err := ds.GetDocumentVersions(p)
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(err))
			_, err = ds.GetDocumentAtVersion(p, hash)
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(err))
			_, err = ds.CompareDocumentVersions(p, hash, hash)
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(err))
			err = ds.RestoreDocumentToVersion(p, hash)
			assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(err))
		})
	}
}

func TestDocumentService_VersionNotFoundIsTyped(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	mustCreate(t, ds, "/doc", "Doc", "x")
	versions, err := ds.GetDocumentVersions("/doc")
	require.NoError(t, err)
	require.NotEmpty(t, versions)
	known := versions[0].Hash
	unknown := "0123456789abcdef0123456789abcdef01234567"

	_, err = ds.GetDocumentAtVersion("/doc", unknown)
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))

	_, err = ds.GetDocumentAtVersion("/other", known)
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err), "file absent from the commit")

	_, err = ds.CompareDocumentVersions("/doc", known, unknown)
	require.Error(t, err)
	var apiErr *apierrors.APIError
	require.True(t, stderrors.As(err, &apiErr))
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErr.Code)
	assert.Equal(t, unknown, apiErr.Details["identifier"])

	err = ds.RestoreDocumentToVersion("/doc", unknown)
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))
}

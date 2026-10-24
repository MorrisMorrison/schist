package services_test

import (
	"archive/zip"
	"bytes"
	"sort"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
)

func zipEntryNames(t *testing.T, data []byte) []string {
	t.Helper()
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	require.NoError(t, err)
	var names []string
	for _, f := range r.File {
		names = append(names, f.Name)
	}
	sort.Strings(names)
	return names
}

func TestDocumentService_ExportFolderZipEntries(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)
	require.NoError(t, ds.CreateFolder("/docs"))
	require.NoError(t, ds.CreateFolder("/docs/sub"))
	mustCreate(t, ds, "/docs/a", "Alpha", "a")
	mustCreate(t, ds, "/docs/sub/b", "Beta", "b")
	mustCreate(t, ds, "/docs/evil", "../../etc/evil", "x")
	mustCreate(t, ds, "/docs/win", `..\..\win`, "x")

	data, filename, err := ds.ExportFolder("/docs")
	require.NoError(t, err)
	assert.Equal(t, "docs.zip", filename)

	names := zipEntryNames(t, data)
	assert.Contains(t, names, "Alpha.md")
	assert.Contains(t, names, "sub/Beta.md", "zip entries must use forward slashes")
	for _, name := range names {
		assert.NotContains(t, name, "..", "zip entry %q must not traverse", name)
		assert.NotContains(t, name, `\`, "zip entry %q must not contain backslashes", name)
	}
}

func TestDocumentService_ExportErrorsAreTyped(t *testing.T) {
	ds, _ := newSafetyDocumentService(t)

	_, _, err := ds.ExportFolder("/missing")
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))

	_, _, err = ds.ExportDocument("/missing")
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))

	_, _, err = ds.ExportFolder("/bad path")
	assert.Equal(t, apierrors.ErrCodeInvalidPath, apiErrorCode(err))
}

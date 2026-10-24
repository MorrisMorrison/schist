package handlers

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestExportHandlers_MissingFolderIsNotFound(t *testing.T) {
	env := newHandlerTestEnv(t)
	w := env.do(t, http.MethodGet, "/api/export/folder/does-not-exist", nil)
	assert.Equal(t, http.StatusNotFound, w.Code, w.Body.String())
	assert.NotContains(t, w.Body.String(), env.dataDir)
}

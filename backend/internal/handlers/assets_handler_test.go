package handlers

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/models"
)

var onePixelPNG = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x62, 0xf8, 0x0f, 0x00, 0x01,
	0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
	0x42, 0x60, 0x82,
}

func (e *handlerTestEnv) upload(t *testing.T, filename, contentType string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", `form-data; name="file"; filename="`+filename+`"`)
	header.Set("Content-Type", contentType)
	part, err := mw.CreatePart(header)
	require.NoError(t, err)
	_, err = part.Write(data)
	require.NoError(t, err)
	require.NoError(t, mw.Close())

	req := httptest.NewRequest(http.MethodPost, "/api/assets/upload", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	w := httptest.NewRecorder()
	e.router.ServeHTTP(w, req)
	return w
}

func TestAssetHandlers_UploadServeDelete(t *testing.T) {
	env := newHandlerTestEnv(t)

	w := env.upload(t, "pic.png", "image/png", onePixelPNG)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var resp struct {
		Asset models.Asset `json:"asset"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, strings.HasPrefix(resp.Asset.Path, "/assets/images/"), "asset path is a URL path: %q", resp.Asset.Path)
	assert.Equal(t, "image/png", resp.Asset.ContentType)

	// The handler routes are relative to /api/assets, e.g. /api/assets/images/<name>.
	servePath := "/api" + resp.Asset.Path
	w = env.do(t, http.MethodGet, servePath, nil)
	assert.Equal(t, http.StatusOK, w.Code)

	w = env.do(t, http.MethodDelete, servePath, nil)
	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())
	_, err := os.Stat(filepath.Join(env.dataDir, "assets", "images", resp.Asset.Name))
	assert.True(t, os.IsNotExist(err), "asset file must be deleted")

	w = env.do(t, http.MethodGet, servePath, nil)
	assert.Equal(t, http.StatusNotFound, w.Code)

	w = env.do(t, http.MethodDelete, servePath, nil)
	assert.Equal(t, http.StatusNotFound, w.Code, w.Body.String())
}

func TestAssetHandlers_UploadRejectionsAreClientErrors(t *testing.T) {
	tests := []struct {
		name        string
		filename    string
		contentType string
		data        []byte
	}{
		{name: "bad extension", filename: "x.exe", contentType: "image/png", data: onePixelPNG},
		{name: "bad content type", filename: "x.png", contentType: "text/html", data: onePixelPNG},
		{name: "content is not an image", filename: "x.png", contentType: "image/png", data: []byte("<html>hi</html>")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			env := newHandlerTestEnv(t)
			w := env.upload(t, tt.filename, tt.contentType, tt.data)
			assert.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
			assert.NotContains(t, w.Body.String(), env.dataDir)
		})
	}
}

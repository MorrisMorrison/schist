package handlers

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGitHubSyncEndpoints_RequireSetup(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	w := env.do(t, http.MethodPost, "/api/github/sync/preview", nil, "")
	assert.Equal(t, http.StatusConflict, w.Code, "GitHub backup is not set up")
	w = env.do(t, http.MethodGet, "/api/github/sync/conflict?path=plan.md", nil, "")
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGitHubSync_BindsResolutions(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	body := `{"resolutions":{"plan.md":"local"},"remote_head":"abc123"}`
	w := env.do(t, http.MethodPost, "/api/github/sync", body, "")
	assert.Equal(t, http.StatusConflict, w.Code, "body binds; GitHub just isn't set up: %s", w.Body.String())
}

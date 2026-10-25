package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_EnvOverrides(t *testing.T) {
	t.Setenv("ENV", "development")
	t.Setenv("SCHIST_JWT_SECRET", "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4")
	t.Setenv("SCHIST_PORT", "9090")
	t.Setenv("SCHIST_DATA_DIR", "/srv/wiki")
	t.Setenv("SCHIST_AUTH_ENABLED", "off")
	t.Setenv("SCHIST_RATE_LIMIT_ENABLED", "no")
	t.Setenv("SCHIST_SHARING_ENABLED", "1")
	t.Setenv("SCHIST_RATE_LIMIT_RPM", "250")
	t.Setenv("SCHIST_SHARE_MAX_EXPIRY_DAYS", "not-a-number")
	t.Setenv("SCHIST_HSTS_PRELOAD", "maybe")
	t.Setenv("SCHIST_X_FRAME_OPTIONS", "SAMEORIGIN")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, 9090, cfg.GetPort())
	assert.Equal(t, "/srv/wiki", cfg.DataDir)
	assert.False(t, cfg.AuthEnabled)
	assert.False(t, cfg.RateLimitEnabled)
	assert.True(t, cfg.SharingEnabled)
	assert.Equal(t, 250, cfg.RateLimitRPM)
	assert.Equal(t, 90, cfg.ShareMaxExpiryDays, "an unparsable int falls back to the default")
	assert.False(t, cfg.SecurityHeaders.HSTSPreload, "an unknown bool falls back to the default")
	assert.Equal(t, "SAMEORIGIN", cfg.SecurityHeaders.XFrameOptions)
	assert.True(t, cfg.IsDevelopment())
}

func TestGetEnvBool(t *testing.T) {
	for _, v := range []string{"true", "TRUE", "1", "yes", "On"} {
		t.Setenv("SCHIST_TEST_BOOL", v)
		assert.True(t, getEnvBool("SCHIST_TEST_BOOL", false), v)
	}
	for _, v := range []string{"false", "0", "No", "OFF"} {
		t.Setenv("SCHIST_TEST_BOOL", v)
		assert.False(t, getEnvBool("SCHIST_TEST_BOOL", true), v)
	}
	t.Setenv("SCHIST_TEST_BOOL", "")
	assert.True(t, getEnvBool("SCHIST_TEST_BOOL", true))
}

func TestLoad_ProductionRequiresSecret(t *testing.T) {
	t.Setenv("ENV", "production")
	t.Setenv("SCHIST_JWT_SECRET", "")
	_, err := Load()
	assert.Error(t, err)

	t.Setenv("SCHIST_JWT_SECRET", "short")
	_, err = Load()
	assert.Error(t, err)
}

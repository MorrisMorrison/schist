package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testJWTSecret = "aB3$5fG8*9kL2&mN7@pQ4#rS6%tU1!vW0^xY5+zA8-bC3=dE7_fG2~hI4"

func TestLoad_ServerSecret(t *testing.T) {
	t.Run("SCHIST_SECRET_KEY wins", func(t *testing.T) {
		t.Setenv("ENV", "production")
		t.Setenv("SCHIST_JWT_SECRET", testJWTSecret)
		t.Setenv("SCHIST_SECRET_KEY", "a separate key for stored tokens")
		cfg, err := Load()
		require.NoError(t, err)
		assert.Equal(t, "a separate key for stored tokens", cfg.ServerSecret)
	})

	t.Run("falls back to an explicitly set JWT secret", func(t *testing.T) {
		t.Setenv("ENV", "production")
		t.Setenv("SCHIST_JWT_SECRET", testJWTSecret)
		t.Setenv("SCHIST_SECRET_KEY", "")
		cfg, err := Load()
		require.NoError(t, err)
		assert.Equal(t, testJWTSecret, cfg.ServerSecret)
	})

	t.Run("none when the JWT secret is generated for this run", func(t *testing.T) {
		t.Setenv("ENV", "development")
		t.Setenv("SCHIST_JWT_SECRET", "")
		t.Setenv("SCHIST_SECRET_KEY", "")
		cfg, err := Load()
		require.NoError(t, err)
		assert.Empty(t, cfg.ServerSecret, "a key that changes on every start can't protect a stored token")
	})
}

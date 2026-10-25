package config

import (
	"fmt"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/crypto"
)

// Getters hand out copies: a caller mutating what it got back must not change
// the shared settings behind everyone else's back (and without the lock).
func TestSettings_GettersReturnCopies(t *testing.T) {
	dataDir := t.TempDir()
	s, err := LoadSettings(dataDir)
	require.NoError(t, err)
	require.NoError(t, s.UpdateSecretsConfig(dataDir, &SecretsConfig{
		Version: 1,
		Store:   map[string]*crypto.EncryptedValue{"k": crypto.NewEncryptedValue("v", true)},
	}))

	gh := s.GetGitHubSettings()
	gh.Owner = "mutated"
	assert.Empty(t, s.GetGitHubSettings().Owner)

	ui := s.GetUISettings()
	ui.Theme = "mutated"
	assert.Equal(t, "auto", s.GetUISettings().Theme)

	sys := s.GetSystemSettings()
	sys.Version = "mutated"
	assert.Equal(t, "1.0.0", s.GetSystemSettings().Version)

	sc := s.GetSecretsConfig()
	sc.Store["other"] = crypto.NewEncryptedValue("x", true)
	sc.Salt = "mutated"
	assert.NotContains(t, s.GetSecretsConfig().Store, "other")
	assert.Empty(t, s.GetSecretsConfig().Salt)
}

func TestSettings_UpdateAppliesAndSaves(t *testing.T) {
	dataDir := t.TempDir()
	s, err := LoadSettings(dataDir)
	require.NoError(t, err)

	require.NoError(t, s.Update(dataDir, func(st *Settings) error {
		st.GitHub.Owner = "octo"
		return nil
	}))
	assert.Equal(t, "octo", s.GetGitHubSettings().Owner)

	reloaded, err := LoadSettings(dataDir)
	require.NoError(t, err)
	assert.Equal(t, "octo", reloaded.GetGitHubSettings().Owner)

	t.Run("an error from fn skips the save", func(t *testing.T) {
		before := s.GetSystemSettings().UpdatedAt
		boom := fmt.Errorf("boom")
		err := s.Update(dataDir, func(st *Settings) error { return boom })
		require.ErrorIs(t, err, boom)
		assert.Equal(t, before, s.GetSystemSettings().UpdatedAt)
	})
}

// Concurrent readers and writers across every section. Before Settings had a
// mutex this raced (and the secrets map could crash Save's marshal with
// "concurrent map iteration and map write"); -race reports it reliably.
func TestSettings_ConcurrentReadsAndWrites(t *testing.T) {
	dataDir := t.TempDir()
	s, err := LoadSettings(dataDir)
	require.NoError(t, err)
	require.NoError(t, s.UpdateSecretsConfig(dataDir, &SecretsConfig{Version: 1}))

	const workers = 6
	const iterations = 25

	var wg sync.WaitGroup
	for w := range workers {
		wg.Add(4)
		go func() {
			defer wg.Done()
			for i := range iterations {
				gh := s.GetGitHubSettings()
				gh.Owner = fmt.Sprintf("o-%d-%d", w, i)
				assert.NoError(t, s.UpdateGitHubSettings(dataDir, gh))
			}
		}()
		go func() {
			defer wg.Done()
			for range iterations {
				assert.NoError(t, s.UpdateUISettings(dataDir, &UISettings{Theme: "dark"}))
				_ = s.GetUISettings().Theme
				_ = s.GetSystemSettings().UpdatedAt
			}
		}()
		go func() {
			defer wg.Done()
			for i := range iterations {
				key := fmt.Sprintf("k-%d-%d", w, i)
				assert.NoError(t, s.Update(dataDir, func(st *Settings) error {
					if st.Secrets.Store == nil {
						st.Secrets.Store = map[string]*crypto.EncryptedValue{}
					}
					st.Secrets.Store[key] = crypto.NewEncryptedValue("v", true)
					return nil
				}))
			}
		}()
		go func() {
			defer wg.Done()
			for range iterations {
				if sc := s.GetSecretsConfig(); sc != nil {
					for range sc.Store {
					}
				}
				_ = s.HasPlaintextSecrets()
			}
		}()
	}
	wg.Wait()

	assert.Len(t, s.GetSecretsConfig().Store, workers*iterations, "no secret write may be lost")
	reloaded, err := LoadSettings(dataDir)
	require.NoError(t, err)
	assert.Len(t, reloaded.GetSecretsConfig().Store, workers*iterations)
	assert.Equal(t, "dark", reloaded.GetUISettings().Theme)
}

package services_test

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/config"
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
)

// runWithTimeout fails the test instead of hanging forever if fn deadlocks.
func runWithTimeout(t *testing.T, d time.Duration, fn func()) {
	t.Helper()
	done := make(chan struct{})
	go func() {
		defer close(done)
		fn()
	}()
	select {
	case <-done:
	case <-time.After(d):
		t.Fatalf("timed out after %s: possible deadlock", d)
	}
}

// okOrLocked accepts success or the "store is locked" 401; anything else
// (a 500 from a nil store, a missing secret that was never deleted, ...) is
// a consistency bug.
func okOrLocked(err error) bool {
	return err == nil || apiErrorCode(err) == apierrors.ErrCodeUnauthorized
}

// Many goroutines read and write secrets while another toggles Lock/Unlock.
// Before SecretManager had a mutex, Lock() could nil out the store (or clear
// its GCM) under a running Get/Set and panic. Run with -race to catch the
// remaining unsynchronised accesses deterministically.
func TestSecretManager_ConcurrentAccessWhileLocking(t *testing.T) {
	sm, _, _ := newUnlockableSecretManager(t, "cred-1")
	require.NoError(t, sm.UnlockWithPasskey("cred-1"))
	require.NoError(t, sm.SetSecret("stable", "value"))

	const workers = 8
	const iterations = 50

	runWithTimeout(t, 60*time.Second, func() {
		var wg sync.WaitGroup
		stop := make(chan struct{})
		errs := make(chan error, workers*iterations*4)

		// Toggler: lock and unlock as fast as possible.
		toggled := make(chan struct{})
		go func() {
			defer close(toggled)
			for {
				select {
				case <-stop:
					return
				default:
				}
				sm.Lock()
				if err := sm.UnlockWithPasskey("cred-1"); err != nil {
					errs <- fmt.Errorf("unlock: %w", err)
				}
				_ = sm.IsUnlocked()
			}
		}()

		for w := range workers {
			wg.Add(1)
			go func(w int) {
				defer wg.Done()
				for i := range iterations {
					key := fmt.Sprintf("k-%d-%d", w, i)
					if err := sm.SetSecret(key, "v"); !okOrLocked(err) {
						errs <- fmt.Errorf("set %s: %w", key, err)
					}
					if v, err := sm.GetSecret("stable"); !okOrLocked(err) {
						errs <- fmt.Errorf("get stable: %w", err)
					} else if err == nil && v != "value" {
						errs <- fmt.Errorf("get stable: got %q", v)
					}
					if _, err := sm.ListSecrets(); !okOrLocked(err) {
						errs <- fmt.Errorf("list: %w", err)
					}
					if err := sm.DeleteSecret(key); err != nil &&
						!okOrLocked(err) && apiErrorCode(err) != apierrors.ErrCodeNotFound {
						errs <- fmt.Errorf("delete %s: %w", key, err)
					}
					_ = sm.HasSecrets()
					_ = sm.RequiresSetup()
				}
			}(w)
		}

		wg.Wait()
		close(stop)
		<-toggled
		close(errs)
		for err := range errs {
			t.Error(err)
		}
	})

	// The store ends consistent: unlocked state and key agree, and the
	// untouched secret still decrypts.
	require.NoError(t, sm.UnlockWithPasskey("cred-1"))
	require.True(t, sm.IsUnlocked())
	v, err := sm.GetSecret("stable")
	require.NoError(t, err)
	assert.Equal(t, "value", v)
}

// Concurrent writers to distinct keys must not lose each other's updates
// (each SetSecret is a read-modify-write of the shared secrets map) or crash
// with "concurrent map writes" while Save marshals the map.
func TestSecretManager_ConcurrentSetsKeepEveryKey(t *testing.T) {
	sm, _, dir := newUnlockableSecretManager(t, "cred-1")
	require.NoError(t, sm.UnlockWithPasskey("cred-1"))

	const workers = 8
	const perWorker = 20

	runWithTimeout(t, 60*time.Second, func() {
		var wg sync.WaitGroup
		for w := range workers {
			wg.Add(1)
			go func(w int) {
				defer wg.Done()
				for i := range perWorker {
					assert.NoError(t, sm.SetSecret(fmt.Sprintf("k-%d-%d", w, i), "v"))
				}
			}(w)
		}
		wg.Wait()
	})

	keys, err := sm.ListSecrets()
	require.NoError(t, err)
	assert.Len(t, keys, workers*perWorker)

	// What is on disk matches what is in memory.
	reloaded, err := config.LoadSettings(dir)
	require.NoError(t, err)
	require.NotNil(t, reloaded.GetSecretsConfig())
	assert.Len(t, reloaded.GetSecretsConfig().Store, workers*perWorker)
}

// GitHub token reads and writes race with Lock/Unlock and with the GitHub
// settings being updated through the shared Settings.
func TestSecretManager_ConcurrentGitHubTokenAndSettings(t *testing.T) {
	sm, settings, dir := newUnlockableSecretManager(t, "cred-1")
	require.NoError(t, sm.UnlockWithPasskey("cred-1"))
	require.NoError(t, sm.SetGitHubToken("ghp_token"))

	runWithTimeout(t, 60*time.Second, func() {
		var wg sync.WaitGroup
		for w := range 4 {
			wg.Add(3)
			go func() {
				defer wg.Done()
				for range 30 {
					if tok, err := sm.GetGitHubToken(); !okOrLocked(err) {
						t.Errorf("get token: %v", err)
					} else if err == nil && tok != "ghp_token" {
						t.Errorf("get token: got %q", tok)
					}
					if err := sm.SetGitHubToken("ghp_token"); !okOrLocked(err) {
						t.Errorf("set token: %v", err)
					}
				}
			}()
			go func() {
				defer wg.Done()
				for i := range 30 {
					gh := settings.GetGitHubSettings()
					gh.Owner = fmt.Sprintf("owner-%d-%d", w, i)
					assert.NoError(t, settings.UpdateGitHubSettings(dir, gh))
				}
			}()
			go func() {
				defer wg.Done()
				for range 30 {
					sm.Lock()
					assert.NoError(t, sm.UnlockWithPasskey("cred-1"))
				}
			}()
		}
		wg.Wait()
	})

	require.NoError(t, sm.UnlockWithPasskey("cred-1"))
	tok, err := sm.GetGitHubToken()
	require.NoError(t, err)
	assert.Equal(t, "ghp_token", tok)
}

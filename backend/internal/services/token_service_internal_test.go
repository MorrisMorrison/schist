package services

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTokenTestService(t *testing.T, users ...string) (*TokenService, string) {
	t.Helper()
	dir := t.TempDir()
	us := NewUserService(dir)
	for i, u := range users {
		if i == 0 {
			require.NoError(t, us.CreateFirstUser(u, "cred-"+u))
		} else {
			require.NoError(t, us.CreateUser(u, false, "cred-"+u))
		}
	}
	return NewTokenService(dir, us), dir
}

func TestTokenService_CreateStoresOnlyAHash(t *testing.T) {
	s, dir := newTokenTestService(t, "alice")

	raw, info, err := s.Create("alice", "  Laptop  ", TokenScopeRead, 0)
	require.NoError(t, err)

	assert.True(t, strings.HasPrefix(raw, APITokenPrefix))
	assert.Greater(t, len(raw), 40)
	assert.Equal(t, "Laptop", info.Name)
	assert.Equal(t, raw[:10], info.Prefix)
	assert.Equal(t, TokenScopeRead, info.Scope)
	assert.Nil(t, info.ExpiresAt)

	stored, err := os.ReadFile(filepath.Join(dir, appStateDir, "tokens.json"))
	require.NoError(t, err)
	assert.NotContains(t, string(stored), raw, "the raw token is never written")
	assert.Contains(t, string(stored), hashToken(raw))

	stat, err := os.Stat(filepath.Join(dir, appStateDir, "tokens.json"))
	require.NoError(t, err)
	if os.PathSeparator == '/' {
		assert.Equal(t, os.FileMode(0600), stat.Mode().Perm())
	}
}

func TestTokenService_CreateValidatesInput(t *testing.T) {
	s, _ := newTokenTestService(t, "alice")

	cases := map[string]struct {
		name, scope string
		days        int
	}{
		"empty name":      {"  ", TokenScopeRead, 0},
		"long name":       {strings.Repeat("x", 65), TokenScopeRead, 0},
		"unknown scope":   {"ok", "admin", 0},
		"negative expiry": {"ok", TokenScopeRead, -1},
		"expiry too long": {"ok", TokenScopeRead, 366},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, _, err := s.Create("alice", c.name, c.scope, c.days)
			require.Error(t, err)
			assert.True(t, apierrors.IsAPIError(err))
		})
	}
}

func TestTokenService_LimitsTokensPerUser(t *testing.T) {
	s, _ := newTokenTestService(t, "alice", "bob")
	for range maxTokensPerUser {
		_, _, err := s.Create("alice", "t", TokenScopeRead, 0)
		require.NoError(t, err)
	}
	_, _, err := s.Create("alice", "one too many", TokenScopeRead, 0)
	assert.Error(t, err)
	_, _, err = s.Create("bob", "bob is fine", TokenScopeRead, 0)
	assert.NoError(t, err, "the limit is per user")
}

func TestTokenService_ListAndRevokeAreScopedToTheOwner(t *testing.T) {
	s, _ := newTokenTestService(t, "alice", "bob")
	now := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)
	s.now = func() time.Time { return now }
	_, older, err := s.Create("alice", "older", TokenScopeRead, 0)
	require.NoError(t, err)
	now = now.Add(time.Hour)
	_, newer, err := s.Create("alice", "newer", TokenScopeReadWrite, 30)
	require.NoError(t, err)
	_, bobs, err := s.Create("bob", "bob's", TokenScopeRead, 0)
	require.NoError(t, err)

	list, err := s.List("alice")
	require.NoError(t, err)
	require.Len(t, list, 2)
	assert.Equal(t, []string{"newer", "older"}, []string{list[0].Name, list[1].Name}, "newest first")
	assert.Equal(t, now.AddDate(0, 0, 30), *list[0].ExpiresAt)

	err = s.Revoke("alice", bobs.ID)
	assert.True(t, apierrors.HasCode(err, apierrors.ErrCodeNotFound), "can't revoke another user's token")
	require.NoError(t, s.Revoke("alice", older.ID))

	list, err = s.List("alice")
	require.NoError(t, err)
	assert.Equal(t, []string{newer.ID}, []string{list[0].ID})
}

func TestTokenService_Validate(t *testing.T) {
	s, _ := newTokenTestService(t, "alice", "bob")
	now := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)
	s.now = func() time.Time { return now }

	raw, info, err := s.Create("alice", "laptop", TokenScopeReadWrite, 1)
	require.NoError(t, err)

	token, err := s.Validate(raw)
	require.NoError(t, err)
	assert.Equal(t, "alice", token.Username)
	assert.True(t, token.CanWrite())

	unauthorized := func(raw string) {
		t.Helper()
		_, err := s.Validate(raw)
		assert.True(t, apierrors.HasCode(err, apierrors.ErrCodeUnauthorized), "%q: %v", raw, err)
	}
	unauthorized(raw + "x")
	unauthorized("sch_unknown")
	unauthorized("eyJhbGciOi.not-a-token")

	now = now.AddDate(0, 0, 1)
	unauthorized(raw) // expired

	raw2, _, err := s.Create("bob", "bob", TokenScopeRead, 0)
	require.NoError(t, err)
	require.NoError(t, s.userService.DeleteUser("bob"))
	unauthorized(raw2) // its user is gone

	require.NoError(t, s.Revoke("alice", info.ID))
	now = now.AddDate(0, 0, -1)
	unauthorized(raw) // revoked
}

func TestTokenService_LastUsedIsWrittenAtMostOncePerMinute(t *testing.T) {
	s, _ := newTokenTestService(t, "alice")
	now := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)
	s.now = func() time.Time { return now }
	raw, _, err := s.Create("alice", "t", TokenScopeRead, 0)
	require.NoError(t, err)

	lastUsed := func() time.Time {
		list, err := s.List("alice")
		require.NoError(t, err)
		require.NotNil(t, list[0].LastUsedAt)
		return *list[0].LastUsedAt
	}

	_, err = s.Validate(raw)
	require.NoError(t, err)
	assert.Equal(t, now, lastUsed())

	now = now.Add(30 * time.Second)
	_, err = s.Validate(raw)
	require.NoError(t, err)
	assert.Equal(t, now.Add(-30*time.Second), lastUsed(), "not rewritten within a minute")

	now = now.Add(time.Minute)
	_, err = s.Validate(raw)
	require.NoError(t, err)
	assert.Equal(t, now, lastUsed())
}

// Validations and creations at once must not lose tokens. Run with -race.
func TestTokenService_ConcurrentCreateAndValidate(t *testing.T) {
	s, _ := newTokenTestService(t, "alice")
	raw, _, err := s.Create("alice", "seed", TokenScopeRead, 0)
	require.NoError(t, err)

	var wg sync.WaitGroup
	for range 8 {
		wg.Add(2)
		go func() {
			defer wg.Done()
			_, _, err := s.Create("alice", "t", TokenScopeRead, 0)
			assert.NoError(t, err)
		}()
		go func() {
			defer wg.Done()
			_, err := s.Validate(raw)
			assert.NoError(t, err)
		}()
	}
	wg.Wait()

	list, err := s.List("alice")
	require.NoError(t, err)
	assert.Len(t, list, 9)
}

func TestIsAPIToken(t *testing.T) {
	assert.True(t, IsAPIToken("sch_abc"))
	assert.False(t, IsAPIToken("eyJhbGciOi"))
	assert.False(t, IsAPIToken(""))
}

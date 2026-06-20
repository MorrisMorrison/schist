package services_test

import (
	"fmt"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestUserService_ConcurrentCreateUser verifies that concurrent CreateUser
// calls don't lose writes due to a lock-free read-modify-write race. Every
// distinct user that returns nil error must be present in the final file.
func TestUserService_ConcurrentCreateUser(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	const n = 25
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			username := fmt.Sprintf("user-%d", i)
			err := userService.CreateUser(username, false, fmt.Sprintf("cred-%d", i))
			assert.NoError(t, err)
		}(i)
	}
	wg.Wait()

	users, err := userService.ListUsers()
	require.NoError(t, err)
	assert.Len(t, users, n, "all concurrently created users must be persisted")
}

// TestUserService_ConcurrentConsumeInvite verifies that a single invite token
// can be consumed exactly once even under concurrent consume attempts.
func TestUserService_ConcurrentConsumeInvite(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	token, err := userService.GenerateInviteToken("admin")
	require.NoError(t, err)

	const n = 20
	var (
		wg        sync.WaitGroup
		mu        sync.Mutex
		successes int
	)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := userService.ConsumeInviteToken(token); err == nil {
				mu.Lock()
				successes++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	assert.Equal(t, 1, successes, "invite token must be consumable exactly once")
}

// TestShareService_ConcurrentCreateShare verifies that concurrent CreateShare
// calls don't lose writes due to a lock-free read-modify-write race.
func TestShareService_ConcurrentCreateShare(t *testing.T) {
	_, shareService, _, cleanup := setupShareServiceTest(t)
	defer cleanup()

	const n = 25
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := shareService.CreateShare("/test-share-doc", "admin", 7)
			assert.NoError(t, err)
		}()
	}
	wg.Wait()

	shares, err := shareService.ListShares("admin")
	require.NoError(t, err)
	assert.Len(t, shares, n, "all concurrently created shares must be persisted")
}

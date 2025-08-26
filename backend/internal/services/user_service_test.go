package services_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupUserServiceTest(t *testing.T) (string, *services.UserService, func()) {
	testDir, err := os.MkdirTemp("", "user-service-test-*")
	require.NoError(t, err)

	userService := services.NewUserService(testDir)

	cleanup := func() {
		os.RemoveAll(testDir)
	}

	return testDir, userService, cleanup
}

func TestUserService_NewUserService(t *testing.T) {
	testDir, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	assert.NotNil(t, userService)

	// Verify users file path is correctly constructed
	expectedUsersFile := filepath.Join(testDir, "users.json")
	// We can't directly access getUsersFilePath, but we can verify it works correctly
	isFirstSetup, err := userService.IsFirstSetup()
	assert.NoError(t, err)
	assert.True(t, isFirstSetup) // Should be true for new service

	// File should not exist yet
	_, err = os.Stat(expectedUsersFile)
	assert.True(t, os.IsNotExist(err))
}

func TestUserService_IsFirstSetup(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	t.Run("returns true when no users exist", func(t *testing.T) {
		isFirstSetup, err := userService.IsFirstSetup()

		assert.NoError(t, err)
		assert.True(t, isFirstSetup)
	})

	t.Run("returns false when users exist", func(t *testing.T) {
		// Create first user
		err := userService.CreateFirstUser("admin", "credential-123")
		require.NoError(t, err)

		isFirstSetup, err := userService.IsFirstSetup()
		assert.NoError(t, err)
		assert.False(t, isFirstSetup)
	})
}

func TestUserService_CreateFirstUser(t *testing.T) {
	t.Run("creates first user successfully", func(t *testing.T) {
		_, userService, cleanup := setupUserServiceTest(t)
		defer cleanup()

		err := userService.CreateFirstUser("admin", "credential-123")

		assert.NoError(t, err)

		// Verify user was created
		user, err := userService.GetUserByUsername("admin")
		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "admin", user.Username)
		assert.True(t, user.IsAdmin)
		assert.Contains(t, user.PasskeyIDs, "credential-123")
		assert.False(t, user.CreatedAt.IsZero())
		assert.False(t, user.LastLogin.IsZero())

		// Verify it's no longer first setup
		isFirstSetup, err := userService.IsFirstSetup()
		assert.NoError(t, err)
		assert.False(t, isFirstSetup)
	})

	t.Run("fails when users already exist", func(t *testing.T) {
		_, userService, cleanup := setupUserServiceTest(t)
		defer cleanup()

		// Create first user
		err := userService.CreateFirstUser("admin", "credential-123")
		require.NoError(t, err)

		// Try to create first user again
		err = userService.CreateFirstUser("admin2", "credential-456")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "users already exist, cannot create first user")
	})
}

func TestUserService_GetUserByCredentialID(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	// Create test users
	err := userService.CreateFirstUser("admin", "credential-123")
	require.NoError(t, err)

	err = userService.CreateUser("user1", false, "credential-456")
	require.NoError(t, err)

	// Add additional passkey to admin
	err = userService.AddPasskeyToUser("admin", "credential-789")
	require.NoError(t, err)

	t.Run("finds user by first credential ID", func(t *testing.T) {
		user, err := userService.GetUserByCredentialID("credential-123")

		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "admin", user.Username)
		assert.True(t, user.IsAdmin)
	})

	t.Run("finds user by additional credential ID", func(t *testing.T) {
		user, err := userService.GetUserByCredentialID("credential-789")

		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "admin", user.Username)
		assert.True(t, user.IsAdmin)
	})

	t.Run("finds different user by their credential ID", func(t *testing.T) {
		user, err := userService.GetUserByCredentialID("credential-456")

		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "user1", user.Username)
		assert.False(t, user.IsAdmin)
	})

	t.Run("returns error for non-existent credential ID", func(t *testing.T) {
		_, err := userService.GetUserByCredentialID("non-existent")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "user not found for credential ID")
	})
}

func TestUserService_GetUserByUsername(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	// Create test users
	err := userService.CreateFirstUser("admin", "credential-123")
	require.NoError(t, err)

	err = userService.CreateUser("user1", false, "credential-456")
	require.NoError(t, err)

	t.Run("finds admin user", func(t *testing.T) {
		user, err := userService.GetUserByUsername("admin")

		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "admin", user.Username)
		assert.True(t, user.IsAdmin)
		assert.Contains(t, user.PasskeyIDs, "credential-123")
	})

	t.Run("finds regular user", func(t *testing.T) {
		user, err := userService.GetUserByUsername("user1")

		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "user1", user.Username)
		assert.False(t, user.IsAdmin)
		assert.Contains(t, user.PasskeyIDs, "credential-456")
	})

	t.Run("returns error for non-existent user", func(t *testing.T) {
		_, err := userService.GetUserByUsername("non-existent")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "user not found")
	})
}

func TestUserService_UpdateLastLogin(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	// Create test user
	err := userService.CreateFirstUser("admin", "credential-123")
	require.NoError(t, err)

	// Get original login time
	originalUser, err := userService.GetUserByUsername("admin")
	require.NoError(t, err)
	originalLoginTime := originalUser.LastLogin

	// Wait a bit to ensure time difference
	time.Sleep(time.Millisecond * 10)

	t.Run("updates last login time successfully", func(t *testing.T) {
		err := userService.UpdateLastLogin("admin")
		assert.NoError(t, err)

		// Verify login time was updated
		updatedUser, err := userService.GetUserByUsername("admin")
		assert.NoError(t, err)
		assert.True(t, updatedUser.LastLogin.After(originalLoginTime))
	})

	t.Run("returns error for non-existent user", func(t *testing.T) {
		err := userService.UpdateLastLogin("non-existent")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "user not found")
	})
}

func TestUserService_AddPasskeyToUser(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	// Create test user
	err := userService.CreateFirstUser("admin", "credential-123")
	require.NoError(t, err)

	t.Run("adds passkey to existing user", func(t *testing.T) {
		err := userService.AddPasskeyToUser("admin", "credential-456")
		assert.NoError(t, err)

		// Verify passkey was added
		user, err := userService.GetUserByUsername("admin")
		assert.NoError(t, err)
		assert.Len(t, user.PasskeyIDs, 2)
		assert.Contains(t, user.PasskeyIDs, "credential-123")
		assert.Contains(t, user.PasskeyIDs, "credential-456")

		// Verify user can be found by either credential
		userBy123, err := userService.GetUserByCredentialID("credential-123")
		assert.NoError(t, err)
		assert.Equal(t, "admin", userBy123.Username)

		userBy456, err := userService.GetUserByCredentialID("credential-456")
		assert.NoError(t, err)
		assert.Equal(t, "admin", userBy456.Username)
	})

	t.Run("returns error for non-existent user", func(t *testing.T) {
		err := userService.AddPasskeyToUser("non-existent", "credential-789")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "user not found")
	})
}

func TestUserService_CreateUser(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	// Create first user to enable regular user creation
	err := userService.CreateFirstUser("admin", "credential-123")
	require.NoError(t, err)

	t.Run("creates regular user successfully", func(t *testing.T) {
		err := userService.CreateUser("user1", false, "credential-456")

		assert.NoError(t, err)

		// Verify user was created
		user, err := userService.GetUserByUsername("user1")
		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "user1", user.Username)
		assert.False(t, user.IsAdmin)
		assert.Contains(t, user.PasskeyIDs, "credential-456")
		assert.False(t, user.CreatedAt.IsZero())
		assert.False(t, user.LastLogin.IsZero())
	})

	t.Run("creates admin user successfully", func(t *testing.T) {
		err := userService.CreateUser("admin2", true, "credential-789")

		assert.NoError(t, err)

		user, err := userService.GetUserByUsername("admin2")
		assert.NoError(t, err)
		assert.True(t, user.IsAdmin)
	})

	t.Run("fails when user already exists", func(t *testing.T) {
		// Try to create user with existing username
		err := userService.CreateUser("admin", false, "credential-new")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "user already exists")
	})
}

func TestUserService_DeleteUser(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	// Create test users
	err := userService.CreateFirstUser("admin", "credential-123")
	require.NoError(t, err)

	err = userService.CreateUser("user1", false, "credential-456")
	require.NoError(t, err)

	err = userService.CreateUser("user2", false, "credential-789")
	require.NoError(t, err)

	t.Run("deletes user successfully", func(t *testing.T) {
		err := userService.DeleteUser("user1")
		assert.NoError(t, err)

		// Verify user is deleted
		_, err = userService.GetUserByUsername("user1")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "user not found")

		// Verify credential ID no longer works
		_, err = userService.GetUserByCredentialID("credential-456")
		assert.Error(t, err)

		// Verify other users still exist
		_, err = userService.GetUserByUsername("admin")
		assert.NoError(t, err)

		_, err = userService.GetUserByUsername("user2")
		assert.NoError(t, err)
	})

	t.Run("returns error for non-existent user", func(t *testing.T) {
		err := userService.DeleteUser("non-existent")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "user not found")
	})
}

func TestUserService_ListUsers(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	t.Run("returns empty list when no users", func(t *testing.T) {
		users, err := userService.ListUsers()

		assert.NoError(t, err)
		assert.Empty(t, users)
	})

	t.Run("returns all users", func(t *testing.T) {
		// Create test users
		err := userService.CreateFirstUser("admin", "credential-123")
		require.NoError(t, err)

		err = userService.CreateUser("user1", false, "credential-456")
		require.NoError(t, err)

		err = userService.CreateUser("user2", true, "credential-789")
		require.NoError(t, err)

		users, err := userService.ListUsers()

		assert.NoError(t, err)
		assert.Len(t, users, 3)

		// Verify all users are present
		usernames := make([]string, len(users))
		for i, user := range users {
			usernames[i] = user.Username
		}
		assert.Contains(t, usernames, "admin")
		assert.Contains(t, usernames, "user1")
		assert.Contains(t, usernames, "user2")

		// Verify admin status
		for _, user := range users {
			switch user.Username {
			case "admin", "user2":
				assert.True(t, user.IsAdmin)
			case "user1":
				assert.False(t, user.IsAdmin)
			}
		}
	})
}

func TestUserService_InviteTokenSystem(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	// Create admin user
	err := userService.CreateFirstUser("admin", "credential-123")
	require.NoError(t, err)

	t.Run("generates invite token successfully", func(t *testing.T) {
		token, err := userService.GenerateInviteToken("admin")

		assert.NoError(t, err)
		assert.NotEmpty(t, token)
		assert.Len(t, token, 64) // 32 bytes hex-encoded = 64 characters

		// Token should be valid
		invite, err := userService.ValidateInviteToken(token)
		assert.NoError(t, err)
		assert.NotNil(t, invite)
		assert.Equal(t, token, invite.Token)
		assert.Equal(t, "admin", invite.CreatedBy)
		assert.False(t, invite.CreatedAt.IsZero())
		assert.True(t, invite.ExpiresAt.After(time.Now()))

		// Should expire in ~7 days
		expectedExpiry := time.Now().Add(7 * 24 * time.Hour)
		assert.WithinDuration(t, expectedExpiry, invite.ExpiresAt, time.Hour)
	})

	t.Run("validates invite token successfully", func(t *testing.T) {
		token, err := userService.GenerateInviteToken("admin")
		require.NoError(t, err)

		invite, err := userService.ValidateInviteToken(token)

		assert.NoError(t, err)
		assert.NotNil(t, invite)
		assert.Equal(t, token, invite.Token)
		assert.Equal(t, "admin", invite.CreatedBy)
	})

	t.Run("fails to validate invalid token", func(t *testing.T) {
		_, err := userService.ValidateInviteToken("invalid-token")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid invite token")
	})

	t.Run("consumes invite token successfully", func(t *testing.T) {
		token, err := userService.GenerateInviteToken("admin")
		require.NoError(t, err)

		// Verify token is valid before consumption
		_, err = userService.ValidateInviteToken(token)
		assert.NoError(t, err)

		// Consume token
		err = userService.ConsumeInviteToken(token)
		assert.NoError(t, err)

		// Verify token is no longer valid
		_, err = userService.ValidateInviteToken(token)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid invite token")
	})

	t.Run("fails to consume invalid token", func(t *testing.T) {
		err := userService.ConsumeInviteToken("invalid-token")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid invite token")
	})

	t.Run("generates unique tokens", func(t *testing.T) {
		token1, err := userService.GenerateInviteToken("admin")
		require.NoError(t, err)

		token2, err := userService.GenerateInviteToken("admin")
		require.NoError(t, err)

		assert.NotEqual(t, token1, token2)

		// Both should be valid
		_, err = userService.ValidateInviteToken(token1)
		assert.NoError(t, err)

		_, err = userService.ValidateInviteToken(token2)
		assert.NoError(t, err)
	})
}

func TestUserService_Integration(t *testing.T) {
	_, userService, cleanup := setupUserServiceTest(t)
	defer cleanup()

	t.Run("full user management workflow", func(t *testing.T) {
		// 1. Initially should be first setup
		isFirstSetup, err := userService.IsFirstSetup()
		assert.NoError(t, err)
		assert.True(t, isFirstSetup)

		// 2. Create first admin user
		err = userService.CreateFirstUser("admin", "credential-admin")
		assert.NoError(t, err)

		// 3. No longer first setup
		isFirstSetup, err = userService.IsFirstSetup()
		assert.NoError(t, err)
		assert.False(t, isFirstSetup)

		// 4. Generate invite and create regular user
		inviteToken, err := userService.GenerateInviteToken("admin")
		assert.NoError(t, err)

		err = userService.CreateUser("user1", false, "credential-user1")
		assert.NoError(t, err)

		// 5. Consume the invite token
		err = userService.ConsumeInviteToken(inviteToken)
		assert.NoError(t, err)

		// 6. Add additional passkey to admin
		err = userService.AddPasskeyToUser("admin", "credential-admin-2")
		assert.NoError(t, err)

		// 7. Update login time
		err = userService.UpdateLastLogin("user1")
		assert.NoError(t, err)

		// 8. List all users
		users, err := userService.ListUsers()
		assert.NoError(t, err)
		assert.Len(t, users, 2)

		// 9. Verify all users can be found by different methods
		adminByName, err := userService.GetUserByUsername("admin")
		assert.NoError(t, err)
		assert.Equal(t, "admin", adminByName.Username)
		assert.Len(t, adminByName.PasskeyIDs, 2)

		adminByCred1, err := userService.GetUserByCredentialID("credential-admin")
		assert.NoError(t, err)
		assert.Equal(t, "admin", adminByCred1.Username)

		adminByCred2, err := userService.GetUserByCredentialID("credential-admin-2")
		assert.NoError(t, err)
		assert.Equal(t, "admin", adminByCred2.Username)

		user1, err := userService.GetUserByCredentialID("credential-user1")
		assert.NoError(t, err)
		assert.Equal(t, "user1", user1.Username)

		// 10. Delete user
		err = userService.DeleteUser("user1")
		assert.NoError(t, err)

		// 11. Verify user is deleted
		users, err = userService.ListUsers()
		assert.NoError(t, err)
		assert.Len(t, users, 1)
		assert.Equal(t, "admin", users[0].Username)
	})
}

func TestUserService_ErrorCases(t *testing.T) {
	t.Run("invalid data directory", func(t *testing.T) {
		// Use an invalid directory path
		invalidPath := "/invalid/path/that/does/not/exist"
		userService := services.NewUserService(invalidPath)

		// Creating the service should succeed (lazy initialization)
		assert.NotNil(t, userService)

		// But operations that need to write should fail
		err := userService.CreateFirstUser("admin", "credential-123")
		assert.Error(t, err)
	})

	t.Run("read-only directory", func(t *testing.T) {
		// Skip this test if running as root (common in CI containers)
		if os.Getuid() == 0 {
			t.Skip("Skipping read-only directory test when running as root")
		}

		testDir, err := os.MkdirTemp("", "user-service-readonly-*")
		require.NoError(t, err)
		defer os.RemoveAll(testDir)

		// Make directory read-only after creating it
		err = os.Chmod(testDir, 0444)
		require.NoError(t, err)

		// Restore permissions for cleanup
		defer func() {
			os.Chmod(testDir, 0755)
		}()

		userService := services.NewUserService(testDir)

		// Should fail to create first user due to permission issues
		err = userService.CreateFirstUser("admin", "credential-123")
		assert.Error(t, err)
	})
}

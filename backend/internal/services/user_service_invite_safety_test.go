package services_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/services"
)

// An invite token comes straight from an unauthenticated request body and is
// used to build a file name. Anything that is not a token we issued must be
// rejected before it reaches the file system: otherwise "../users" reads
// users.json as an (expired) invite and then deletes it, which resets the
// instance to first-run setup.
func TestUserService_InviteTokenCannotEscapeInvitesDir(t *testing.T) {
	tokens := []string{
		"../users",
		"..\\users",
		"../.schist/passkeys",
		"../invites/../users",
		"",
		"not-hex",
		"ABCDEF",
	}

	for _, token := range tokens {
		t.Run(token, func(t *testing.T) {
			dir := t.TempDir()
			us := services.NewUserService(dir)
			require.NoError(t, us.CreateFirstUser("admin", "cred-1"))

			// A JSON object outside the invites dir that would parse as an invite.
			require.NoError(t, os.MkdirAll(filepath.Join(dir, ".schist"), 0755))
			passkeys := filepath.Join(dir, ".schist", "passkeys.json")
			require.NoError(t, os.WriteFile(passkeys, []byte(`{"version":1}`), 0600))

			_, err := us.ValidateInviteToken(token)
			assert.Error(t, err)
			assert.Error(t, us.ConsumeInviteToken(token))

			_, err = os.Stat(filepath.Join(dir, "users.json"))
			assert.NoError(t, err, "users.json must survive a crafted invite token")
			_, err = os.Stat(passkeys)
			assert.NoError(t, err, "passkeys.json must survive a crafted invite token")

			first, err := us.IsFirstSetup()
			require.NoError(t, err)
			assert.False(t, first, "a crafted invite token must not reset the instance to first-run setup")
		})
	}
}

func TestUserService_InviteTokenLifecycle(t *testing.T) {
	t.Run("issued token validates once and is consumed", func(t *testing.T) {
		us := services.NewUserService(t.TempDir())
		token, err := us.GenerateInviteToken("admin")
		require.NoError(t, err)
		assert.Len(t, token, 64)

		invite, err := us.ValidateInviteToken(token)
		require.NoError(t, err)
		assert.Equal(t, "admin", invite.CreatedBy)
		assert.True(t, invite.ExpiresAt.After(time.Now()))

		require.NoError(t, us.ConsumeInviteToken(token))
		assert.Error(t, us.ConsumeInviteToken(token), "a token can only be used once")
	})

	t.Run("expired token is rejected and removed", func(t *testing.T) {
		dir := t.TempDir()
		us := services.NewUserService(dir)
		token, err := us.GenerateInviteToken("admin")
		require.NoError(t, err)

		path := filepath.Join(dir, "invites", token+".json")
		expired := services.Invite{Token: token, ExpiresAt: time.Now().Add(-time.Minute), CreatedBy: "admin"}
		data, err := json.Marshal(expired)
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(path, data, 0600))

		_, err = us.ValidateInviteToken(token)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "expired")
		_, err = os.Stat(path)
		assert.True(t, os.IsNotExist(err), "expired invite file should be deleted")
	})

	t.Run("corrupt invite file is rejected", func(t *testing.T) {
		dir := t.TempDir()
		us := services.NewUserService(dir)
		token, err := us.GenerateInviteToken("admin")
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(filepath.Join(dir, "invites", token+".json"), []byte("{not json"), 0600))

		_, err = us.ValidateInviteToken(token)
		assert.Error(t, err)
	})
}

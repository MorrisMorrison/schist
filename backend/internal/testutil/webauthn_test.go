package testutil

import (
	"testing"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// rpUser is a single-credential WebAuthn user with Schist's fixed user handle.
type rpUser struct {
	credentials []webauthn.Credential
}

func (u *rpUser) WebAuthnID() []byte                         { return []byte("schist-user") }
func (u *rpUser) WebAuthnName() string                       { return "schist-user" }
func (u *rpUser) WebAuthnDisplayName() string                { return "Schist User" }
func (u *rpUser) WebAuthnCredentials() []webauthn.Credential { return u.credentials }

// The authenticator's responses must pass a real relying party's checks.
func TestSoftAuthenticator_PassesRelyingPartyVerification(t *testing.T) {
	rp, err := webauthn.New(&webauthn.Config{RPDisplayName: "test", RPID: RPID, RPOrigins: []string{RPOrigin}})
	require.NoError(t, err)
	user := &rpUser{}
	a := NewSoftAuthenticator(t)

	_, session, err := rp.BeginRegistration(user)
	require.NoError(t, err)
	credential, err := rp.CreateCredential(user, *session, a.Register(t, session.Challenge))
	require.NoError(t, err)
	assert.Equal(t, a.CredID, credential.ID)
	user.credentials = []webauthn.Credential{*credential}

	for round := uint32(1); round <= 2; round++ {
		_, session, err = rp.BeginLogin(user)
		require.NoError(t, err)
		credential, err = rp.ValidateLogin(user, *session, a.Login(t, session.Challenge))
		require.NoError(t, err)
		assert.Equal(t, round, credential.Authenticator.SignCount)
	}

	t.Run("a forged origin is rejected", func(t *testing.T) {
		forged := *a
		forged.Origin = "https://evil.example"
		_, session, err := rp.BeginLogin(user)
		require.NoError(t, err)
		_, err = rp.ValidateLogin(user, *session, forged.Login(t, session.Challenge))
		assert.Error(t, err)
	})
}

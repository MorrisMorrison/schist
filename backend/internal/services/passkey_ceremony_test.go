package services_test

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/config"
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/MorrisMorrison/schist/internal/testutil"
)

func newEmptyPasskeyService(t *testing.T) (*services.PasskeyService, string) {
	t.Helper()
	dir := t.TempDir()
	ps, err := services.NewPasskeyService(&config.Config{DataDir: dir, FrontendURL: testutil.RPOrigin})
	require.NoError(t, err)
	return ps, dir
}

// registerPasskey runs a full registration ceremony and returns the stored ID.
func registerPasskey(t *testing.T, ps *services.PasskeyService, a *testutil.SoftAuthenticator, name string) string {
	t.Helper()
	_, session, err := ps.BeginRegistration(name)
	require.NoError(t, err)
	id, err := ps.FinishRegistration(name, session, a.Register(t, session.Challenge))
	require.NoError(t, err)
	return id
}

func TestPasskeyService_RegistrationCeremony(t *testing.T) {
	ps, dir := newEmptyPasskeyService(t)
	auth := testutil.NewSoftAuthenticator(t)

	has, err := ps.HasCredentials()
	require.NoError(t, err)
	assert.False(t, has)

	creation, session, err := ps.BeginRegistration("Laptop")
	require.NoError(t, err)
	assert.Equal(t, testutil.RPID, creation.Response.RelyingParty.ID)
	assert.Empty(t, creation.Response.CredentialExcludeList)
	assert.Equal(t, protocol.VerificationRequired, creation.Response.AuthenticatorSelection.UserVerification)

	id, err := ps.FinishRegistration("Laptop", session, auth.Register(t, session.Challenge))
	require.NoError(t, err)
	assert.Equal(t, base64.URLEncoding.EncodeToString(auth.CredID), id)

	creds, err := ps.ListCredentials()
	require.NoError(t, err)
	require.Len(t, creds, 1)
	assert.Equal(t, id, creds[0].ID)
	assert.Equal(t, "Laptop", creds[0].Name)
	assert.False(t, creds[0].CreatedAt.IsZero())

	// The stored record carries the public key and a fresh 32-byte key seed.
	raw, err := os.ReadFile(filepath.Join(dir, ".schist", "passkeys.json"))
	require.NoError(t, err)
	var storage services.PasskeyStorage
	require.NoError(t, json.Unmarshal(raw, &storage))
	require.Len(t, storage.Credentials, 1)
	assert.Len(t, storage.Credentials[0].KeySeed, 32)
	assert.NotEmpty(t, storage.Credentials[0].PublicKey)
	assert.True(t, storage.Credentials[0].Flags.UserVerified)
	if runtime.GOOS != "windows" {
		info, err := os.Stat(filepath.Join(dir, ".schist", "passkeys.json"))
		require.NoError(t, err)
		assert.Equal(t, os.FileMode(0600), info.Mode().Perm(), "passkeys.json holds key seeds")
	}

	t.Run("a second registration excludes the existing credential", func(t *testing.T) {
		creation, _, err := ps.BeginRegistration("Phone")
		require.NoError(t, err)
		require.Len(t, creation.Response.CredentialExcludeList, 1)
		assert.Equal(t, auth.CredID, []byte(creation.Response.CredentialExcludeList[0].CredentialID))
	})
}

func TestPasskeyService_RegistrationRejectsBadResponses(t *testing.T) {
	tests := []struct {
		name   string
		tamper func(a *testutil.SoftAuthenticator, session *webauthn.SessionData) string
	}{
		{"wrong challenge", func(a *testutil.SoftAuthenticator, s *webauthn.SessionData) string {
			return testutil.B64URL.EncodeToString([]byte("not-the-challenge-we-issued-0000"))
		}},
		{"wrong origin", func(a *testutil.SoftAuthenticator, s *webauthn.SessionData) string {
			a.Origin = "https://evil.example"
			return s.Challenge
		}},
		{"wrong relying party", func(a *testutil.SoftAuthenticator, s *webauthn.SessionData) string {
			a.RPID = "evil.example"
			return s.Challenge
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ps, _ := newEmptyPasskeyService(t)
			auth := testutil.NewSoftAuthenticator(t)
			_, session, err := ps.BeginRegistration("Laptop")
			require.NoError(t, err)

			challenge := tt.tamper(auth, session)
			_, err = ps.FinishRegistration("Laptop", session, auth.Register(t, challenge))
			require.Error(t, err)
			assert.Equal(t, apierrors.ErrCodeValidation, apiErrorCode(err), "err: %v", err)

			has, err := ps.HasCredentials()
			require.NoError(t, err)
			assert.False(t, has, "a rejected registration must not store a credential")
		})
	}
}

func TestPasskeyService_AuthenticationCeremony(t *testing.T) {
	t.Run("no passkeys registered", func(t *testing.T) {
		ps, _ := newEmptyPasskeyService(t)
		_, _, err := ps.BeginAuthentication()
		require.Error(t, err)
		assert.Equal(t, apierrors.ErrCodeInvalidState, apiErrorCode(err))
	})

	t.Run("valid assertion returns the credential and stores the sign count", func(t *testing.T) {
		ps, dir := newEmptyPasskeyService(t)
		auth := testutil.NewSoftAuthenticator(t)
		id := registerPasskey(t, ps, auth, "Laptop")

		for round := 1; round <= 2; round++ {
			assertion, session, err := ps.BeginAuthentication()
			require.NoError(t, err)
			require.Len(t, assertion.Response.AllowedCredentials, 1)

			got, err := ps.FinishAuthentication(session, auth.Login(t, session.Challenge))
			require.NoError(t, err)
			assert.Equal(t, id, got)

			raw, err := os.ReadFile(filepath.Join(dir, ".schist", "passkeys.json"))
			require.NoError(t, err)
			var storage services.PasskeyStorage
			require.NoError(t, json.Unmarshal(raw, &storage))
			assert.Equal(t, auth.SignCount, storage.Credentials[0].Authenticator.SignCount, "round %d", round)
		}
	})

	tests := []struct {
		name   string
		tamper func(t *testing.T, a *testutil.SoftAuthenticator, challenge string) *protocol.ParsedCredentialAssertionData
	}{
		{"wrong challenge", func(t *testing.T, a *testutil.SoftAuthenticator, _ string) *protocol.ParsedCredentialAssertionData {
			return a.Login(t, testutil.B64URL.EncodeToString([]byte("not-the-challenge-we-issued-0000")))
		}},
		{"wrong origin", func(t *testing.T, a *testutil.SoftAuthenticator, c string) *protocol.ParsedCredentialAssertionData {
			a.Origin = "https://evil.example"
			return a.Login(t, c)
		}},
		{"signed by another key", func(t *testing.T, a *testutil.SoftAuthenticator, c string) *protocol.ParsedCredentialAssertionData {
			other := testutil.NewSoftAuthenticator(t)
			other.CredID = a.CredID
			return other.Login(t, c)
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ps, _ := newEmptyPasskeyService(t)
			auth := testutil.NewSoftAuthenticator(t)
			registerPasskey(t, ps, auth, "Laptop")

			_, session, err := ps.BeginAuthentication()
			require.NoError(t, err)
			_, err = ps.FinishAuthentication(session, tt.tamper(t, auth, session.Challenge))
			require.Error(t, err)
			assert.Equal(t, apierrors.ErrCodeUnauthorized, apiErrorCode(err), "err: %v", err)
		})
	}
}

func TestPasskeyService_EncryptionKeyDerivation(t *testing.T) {
	ps, _ := newEmptyPasskeyService(t)
	idA := registerPasskey(t, ps, testutil.NewSoftAuthenticator(t), "A")
	idB := registerPasskey(t, ps, testutil.NewSoftAuthenticator(t), "B")

	keyA, err := ps.GetEncryptionKey(idA)
	require.NoError(t, err)
	assert.Len(t, keyA, 32)
	again, err := ps.GetEncryptionKey(idA)
	require.NoError(t, err)
	assert.Equal(t, keyA, again, "the key must be stable or stored secrets become unreadable")

	keyB, err := ps.GetEncryptionKey(idB)
	require.NoError(t, err)
	assert.NotEqual(t, keyA, keyB, "each passkey has its own key seed")

	_, err = ps.GetEncryptionKey("unknown")
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err))

	require.NoError(t, ps.DeleteCredential(idA))
	_, err = ps.GetEncryptionKey(idA)
	assert.Equal(t, apierrors.ErrCodeNotFound, apiErrorCode(err), "a deleted passkey must not unlock anything")
	creds, err := ps.ListCredentials()
	require.NoError(t, err)
	require.Len(t, creds, 1)
	assert.Equal(t, idB, creds[0].ID)
}

func TestPasskeyService_KnownSeedGivesKnownKey(t *testing.T) {
	// HKDF-SHA256(seed, salt=nil, info="schist-secret-encryption"): pinning the
	// output guards against an accidental change that would orphan every
	// secret encrypted under the old derivation.
	ps, _ := newTestPasskeyService(t, "cred-1")
	key, err := ps.GetEncryptionKey("cred-1")
	require.NoError(t, err)
	assert.Equal(t, "37a2d340d85c0a857cdd0684165b5db0d4585b5c330b219d0c9e1ac2054a5cd7", hex.EncodeToString(key))
}

func TestPasskeyService_CorruptStorage(t *testing.T) {
	ps, dir := newEmptyPasskeyService(t)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, ".schist"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".schist", "passkeys.json"), []byte("{broken"), 0600))

	_, err := ps.ListCredentials()
	assert.Error(t, err)
	_, err = ps.HasCredentials()
	assert.Error(t, err)
	_, err = ps.GetEncryptionKey("x")
	assert.Error(t, err)
	assert.Error(t, ps.DeleteCredential("x"))
	_, _, err = ps.BeginRegistration("x")
	assert.Error(t, err)
	_, _, err = ps.BeginAuthentication()
	assert.Error(t, err)
	_, err = ps.FinishRegistration("x", &webauthn.SessionData{}, &protocol.ParsedCredentialCreationData{})
	assert.Error(t, err)
	_, err = ps.FinishAuthentication(&webauthn.SessionData{}, &protocol.ParsedCredentialAssertionData{})
	assert.Error(t, err)

	raw, err := os.ReadFile(filepath.Join(dir, ".schist", "passkeys.json"))
	require.NoError(t, err)
	assert.Equal(t, "{broken", string(raw), "a failed load must never overwrite the stored passkeys")
}

func TestNewPasskeyService_Config(t *testing.T) {
	tests := []struct {
		name        string
		frontendURL string
		environment string
		wantErr     bool
	}{
		{"production URL", "https://wiki.example.com", "production", false},
		{"development on 127.0.0.1", "http://127.0.0.1:8080", "development", false},
		{"development on localhost", "http://localhost:8080", "development", false},
		{"unparseable URL", "http://[::1", "production", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ps, err := services.NewPasskeyService(&config.Config{
				DataDir: t.TempDir(), FrontendURL: tt.frontendURL, Environment: tt.environment,
			})
			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, ps)
				return
			}
			require.NoError(t, err)
			assert.NotNil(t, ps)
		})
	}
}

func TestPasskeyUser_WebAuthnIcon(t *testing.T) {
	assert.Empty(t, services.PasskeyUser{}.WebAuthnIcon())
}

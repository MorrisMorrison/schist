// Package testutil holds helpers shared by the backend's tests. It is only
// imported from _test.go files and never compiled into the server.
package testutil

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"testing"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/protocol/webauthncbor"
	"github.com/go-webauthn/webauthn/protocol/webauthncose"
	"github.com/stretchr/testify/require"
)

// The relying party the dev config (ENV=development, FrontendURL
// http://localhost:5173) expects.
const (
	RPID     = "localhost"
	RPOrigin = "http://localhost:5173"
)

// B64URL is the encoding WebAuthn uses for binary fields in JSON.
var B64URL = base64.RawURLEncoding

const (
	flagUserPresent  = 0x01
	flagUserVerified = 0x04
	flagAttested     = 0x40
)

// SoftAuthenticator is a minimal in-process WebAuthn authenticator (one
// ES256 key, "none" attestation, user presence and verification always
// asserted), so passkey ceremonies can run end to end without a browser. It
// produces exactly what a platform authenticator sends: the server verifies
// the real signature, challenge, origin and RP ID hash. Tests may change
// Origin, RPID or CredID to forge a bad response.
type SoftAuthenticator struct {
	Key       *ecdsa.PrivateKey
	CredID    []byte
	SignCount uint32
	RPID      string
	Origin    string
}

// NewSoftAuthenticator returns an authenticator with a fresh key and
// credential ID for the dev relying party.
func NewSoftAuthenticator(t *testing.T) *SoftAuthenticator {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	credID := make([]byte, 16)
	_, err = rand.Read(credID)
	require.NoError(t, err)
	return &SoftAuthenticator{Key: key, CredID: credID, RPID: RPID, Origin: RPOrigin}
}

func (a *SoftAuthenticator) authData(flags byte, attested []byte) []byte {
	rpHash := sha256.Sum256([]byte(a.RPID))
	out := append([]byte{}, rpHash[:]...)
	out = append(out, flags)
	out = binary.BigEndian.AppendUint32(out, a.SignCount)
	return append(out, attested...)
}

func (a *SoftAuthenticator) clientData(t *testing.T, typ, challenge string) []byte {
	t.Helper()
	data, err := json.Marshal(map[string]any{
		"type":        typ,
		"challenge":   challenge,
		"origin":      a.Origin,
		"crossOrigin": false,
	})
	require.NoError(t, err)
	return data
}

// Attestation answers a registration challenge with the JSON of a
// navigator.credentials.create() response.
func (a *SoftAuthenticator) Attestation(t *testing.T, challenge string) json.RawMessage {
	t.Helper()
	coseKey, err := webauthncbor.Marshal(webauthncose.EC2PublicKeyData{
		PublicKeyData: webauthncose.PublicKeyData{
			KeyType:   int64(webauthncose.EllipticKey),
			Algorithm: int64(webauthncose.AlgES256),
		},
		Curve:  int64(webauthncose.P256),
		XCoord: a.Key.X.FillBytes(make([]byte, 32)),
		YCoord: a.Key.Y.FillBytes(make([]byte, 32)),
	})
	require.NoError(t, err)

	attested := make([]byte, 16) // zero AAGUID
	attested = binary.BigEndian.AppendUint16(attested, uint16(len(a.CredID)))
	attested = append(attested, a.CredID...)
	attested = append(attested, coseKey...)

	attObj, err := webauthncbor.Marshal(map[string]any{
		"fmt":      "none",
		"attStmt":  map[string]any{},
		"authData": a.authData(flagUserPresent|flagUserVerified|flagAttested, attested),
	})
	require.NoError(t, err)

	resp, err := json.Marshal(map[string]any{
		"id":    B64URL.EncodeToString(a.CredID),
		"rawId": B64URL.EncodeToString(a.CredID),
		"type":  "public-key",
		"response": map[string]any{
			"clientDataJSON":    B64URL.EncodeToString(a.clientData(t, "webauthn.create", challenge)),
			"attestationObject": B64URL.EncodeToString(attObj),
		},
	})
	require.NoError(t, err)
	return resp
}

// Assertion answers an authentication challenge with the JSON of a
// navigator.credentials.get() response. Each call bumps the sign count.
func (a *SoftAuthenticator) Assertion(t *testing.T, challenge string) json.RawMessage {
	t.Helper()
	a.SignCount++
	authData := a.authData(flagUserPresent|flagUserVerified, nil)
	clientData := a.clientData(t, "webauthn.get", challenge)
	clientHash := sha256.Sum256(clientData)
	digest := sha256.Sum256(append(append([]byte{}, authData...), clientHash[:]...))
	sig, err := ecdsa.SignASN1(rand.Reader, a.Key, digest[:])
	require.NoError(t, err)

	resp, err := json.Marshal(map[string]any{
		"id":    B64URL.EncodeToString(a.CredID),
		"rawId": B64URL.EncodeToString(a.CredID),
		"type":  "public-key",
		"response": map[string]any{
			"clientDataJSON":    B64URL.EncodeToString(clientData),
			"authenticatorData": B64URL.EncodeToString(authData),
			"signature":         B64URL.EncodeToString(sig),
			"userHandle":        B64URL.EncodeToString([]byte("schist-user")),
		},
	})
	require.NoError(t, err)
	return resp
}

// Register is Attestation parsed the way the server parses it, for tests that
// call the passkey service directly.
func (a *SoftAuthenticator) Register(t *testing.T, challenge string) *protocol.ParsedCredentialCreationData {
	t.Helper()
	parsed, err := protocol.ParseCredentialCreationResponseBytes(a.Attestation(t, challenge))
	require.NoError(t, err)
	return parsed
}

// Login is Assertion parsed the way the server parses it.
func (a *SoftAuthenticator) Login(t *testing.T, challenge string) *protocol.ParsedCredentialAssertionData {
	t.Helper()
	parsed, err := protocol.ParseCredentialRequestResponseBytes(a.Assertion(t, challenge))
	require.NoError(t, err)
	return parsed
}

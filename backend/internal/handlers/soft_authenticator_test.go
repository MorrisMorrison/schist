package handlers

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/go-webauthn/webauthn/protocol/webauthncbor"
	"github.com/go-webauthn/webauthn/protocol/webauthncose"
	"github.com/stretchr/testify/require"
)

// softAuthenticator is a minimal in-process WebAuthn authenticator (ES256,
// "none" attestation) so the passkey endpoints can be driven end to end
// without a browser. It produces exactly what a platform authenticator sends:
// the server verifies the real signature, challenge, origin and RP ID hash.
type softAuthenticator struct {
	key       *ecdsa.PrivateKey
	credID    []byte
	signCount uint32
	rpID      string
	origin    string
}

func newSoftAuthenticator(t *testing.T) *softAuthenticator {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	credID := make([]byte, 16)
	_, err = rand.Read(credID)
	require.NoError(t, err)
	return &softAuthenticator{
		key:    key,
		credID: credID,
		rpID:   "localhost",
		origin: "http://localhost:5173",
	}
}

var b64url = base64.RawURLEncoding

const (
	flagUserPresent  = 0x01
	flagUserVerified = 0x04
	flagAttested     = 0x40
)

func (a *softAuthenticator) authData(flags byte, attested []byte) []byte {
	rpHash := sha256.Sum256([]byte(a.rpID))
	out := append([]byte{}, rpHash[:]...)
	out = append(out, flags)
	counter := make([]byte, 4)
	binary.BigEndian.PutUint32(counter, a.signCount)
	out = append(out, counter...)
	return append(out, attested...)
}

func (a *softAuthenticator) clientData(t *testing.T, typ, challenge string) []byte {
	t.Helper()
	data, err := json.Marshal(map[string]any{
		"type":        typ,
		"challenge":   challenge,
		"origin":      a.origin,
		"crossOrigin": false,
	})
	require.NoError(t, err)
	return data
}

// challengeFrom extracts publicKey.challenge from a begin-* response.
func challengeFrom(t *testing.T, body map[string]any) string {
	t.Helper()
	options, ok := body["options"].(map[string]any)
	require.True(t, ok, "options missing: %v", body)
	publicKey, ok := options["publicKey"].(map[string]any)
	require.True(t, ok, "publicKey missing: %v", options)
	challenge, ok := publicKey["challenge"].(string)
	require.True(t, ok)
	return challenge
}

// attestation builds the navigator.credentials.create() response JSON.
func (a *softAuthenticator) attestation(t *testing.T, challenge string) json.RawMessage {
	t.Helper()
	cose := webauthncose.EC2PublicKeyData{
		PublicKeyData: webauthncose.PublicKeyData{
			KeyType:   int64(webauthncose.EllipticKey),
			Algorithm: int64(webauthncose.AlgES256),
		},
		Curve:  int64(webauthncose.P256),
		XCoord: a.key.X.FillBytes(make([]byte, 32)),
		YCoord: a.key.Y.FillBytes(make([]byte, 32)),
	}
	coseKey, err := webauthncbor.Marshal(cose)
	require.NoError(t, err)

	attested := make([]byte, 16) // zero AAGUID
	idLen := make([]byte, 2)
	binary.BigEndian.PutUint16(idLen, uint16(len(a.credID)))
	attested = append(attested, idLen...)
	attested = append(attested, a.credID...)
	attested = append(attested, coseKey...)

	attObj, err := webauthncbor.Marshal(map[string]any{
		"fmt":      "none",
		"attStmt":  map[string]any{},
		"authData": a.authData(flagUserPresent|flagUserVerified|flagAttested, attested),
	})
	require.NoError(t, err)

	resp, err := json.Marshal(map[string]any{
		"id":    b64url.EncodeToString(a.credID),
		"rawId": b64url.EncodeToString(a.credID),
		"type":  "public-key",
		"response": map[string]any{
			"clientDataJSON":    b64url.EncodeToString(a.clientData(t, "webauthn.create", challenge)),
			"attestationObject": b64url.EncodeToString(attObj),
		},
	})
	require.NoError(t, err)
	return resp
}

// assertion builds the navigator.credentials.get() response JSON.
func (a *softAuthenticator) assertion(t *testing.T, challenge string) json.RawMessage {
	t.Helper()
	a.signCount++
	authData := a.authData(flagUserPresent|flagUserVerified, nil)
	clientData := a.clientData(t, "webauthn.get", challenge)
	clientHash := sha256.Sum256(clientData)
	digest := sha256.Sum256(append(append([]byte{}, authData...), clientHash[:]...))
	sig, err := ecdsa.SignASN1(rand.Reader, a.key, digest[:])
	require.NoError(t, err)

	resp, err := json.Marshal(map[string]any{
		"id":    b64url.EncodeToString(a.credID),
		"rawId": b64url.EncodeToString(a.credID),
		"type":  "public-key",
		"response": map[string]any{
			"clientDataJSON":    b64url.EncodeToString(clientData),
			"authenticatorData": b64url.EncodeToString(authData),
			"signature":         b64url.EncodeToString(sig),
			"userHandle":        b64url.EncodeToString([]byte("schist-user")),
		},
	})
	require.NoError(t, err)
	return resp
}

// registerPasskey runs register/begin + register/finish and returns the
// stored credential ID.
func (e *apiEnv) registerPasskey(t *testing.T, a *softAuthenticator, name, token string) string {
	t.Helper()
	w := e.do(t, http.MethodPost, "/api/passkeys/register/begin", map[string]any{"name": name}, token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	begin := decode(t, w)

	w = e.do(t, http.MethodPost, "/api/passkeys/register/finish", map[string]any{
		"name":      name,
		"sessionId": begin["sessionId"],
		"response":  a.attestation(t, challengeFrom(t, begin)),
	}, token)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	credentialID, _ := decode(t, w)["credentialId"].(string)
	require.NotEmpty(t, credentialID)
	return credentialID
}

// authTicket runs authenticate/begin + authenticate/finish and returns the
// single-use auth ticket.
func (e *apiEnv) authTicket(t *testing.T, a *softAuthenticator) string {
	t.Helper()
	w := e.do(t, http.MethodPost, "/api/passkeys/authenticate/begin", nil, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	begin := decode(t, w)

	w = e.do(t, http.MethodPost, "/api/passkeys/authenticate/finish", map[string]any{
		"sessionId": begin["sessionId"],
		"response":  a.assertion(t, challengeFrom(t, begin)),
	}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	ticket, _ := decode(t, w)["authTicket"].(string)
	require.NotEmpty(t, ticket)
	return ticket
}

// login exchanges a fresh auth ticket for a JWT.
func (e *apiEnv) login(t *testing.T, a *softAuthenticator) string {
	t.Helper()
	w := e.do(t, http.MethodPost, "/api/auth/login/passkey", map[string]any{"authTicket": e.authTicket(t, a)}, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	token, _ := decode(t, w)["token"].(string)
	require.NotEmpty(t, token)
	return token
}

// setupAdmin registers a passkey during first-time setup, creates the first
// (admin) user bound to it and logs in. The env's token is set to the JWT.
func (e *apiEnv) setupAdmin(t *testing.T, username string) (*softAuthenticator, string) {
	t.Helper()
	a := newSoftAuthenticator(t)
	credID := e.registerPasskey(t, a, "admin key", "")
	w := e.do(t, http.MethodPost, "/api/auth/setup/first-user", map[string]any{
		"username":      username,
		"credential_id": credID,
	}, "")
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	e.token = e.login(t, a)
	return a, credID
}

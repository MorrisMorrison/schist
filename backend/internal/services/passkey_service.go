package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"golang.org/x/crypto/hkdf"

	"github.com/MorrisMorrison/schist/internal/config"
)

// PasskeyCredential represents a stored passkey credential
type PasskeyCredential struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	CreatedAt       time.Time `json:"createdAt"`
	CredentialID    []byte    `json:"credentialId"`
	PublicKey       []byte    `json:"publicKey"`
	AttestationType string    `json:"attestationType"`
	Transport       []string  `json:"transport"`
	Flags           struct {
		UserPresent    bool `json:"userPresent"`
		UserVerified   bool `json:"userVerified"`
		BackupEligible bool `json:"backupEligible"`
		BackupState    bool `json:"backupState"`
	} `json:"flags"`
	Authenticator struct {
		AAGUID       []byte `json:"aaguid"`
		SignCount    uint32 `json:"signCount"`
		CloneWarning bool   `json:"cloneWarning"`
	} `json:"authenticator"`
	KeySeed []byte `json:"keySeed"` // For deriving encryption keys
}

// PasskeyStorage represents the storage structure for passkeys
type PasskeyStorage struct {
	Version     int                 `json:"version"`
	Credentials []PasskeyCredential `json:"credentials"`
}

// PasskeyUser implements webauthn.User interface
type PasskeyUser struct {
	id          []byte
	name        string
	displayName string
	credentials []webauthn.Credential
}

func (u PasskeyUser) WebAuthnID() []byte {
	return u.id
}

func (u PasskeyUser) WebAuthnName() string {
	return u.name
}

func (u PasskeyUser) WebAuthnDisplayName() string {
	return u.displayName
}

func (u PasskeyUser) WebAuthnCredentials() []webauthn.Credential {
	return u.credentials
}

func (u PasskeyUser) WebAuthnIcon() string {
	return ""
}

// PasskeyService provides WebAuthn passkey functionality
type PasskeyService struct {
	dataDir  string
	webauthn *webauthn.WebAuthn
}

// NewPasskeyService creates a new passkey service with proper WebAuthn configuration
func NewPasskeyService(config *config.Config) (*PasskeyService, error) {
	// Parse frontend URL to extract host for RP configuration
	frontendURL, err := url.Parse(config.FrontendURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse frontend URL: %w", err)
	}

	// Extract hostname without port for RPID (WebAuthn requirement)
	rpID := frontendURL.Hostname()

	// Create list of allowed origins (include both with and without port for flexibility)
	rpOrigins := []string{config.FrontendURL}

	// Add development origins if we're in development mode
	if config.Environment == "development" {
		rpOrigins = append(rpOrigins,
			"http://localhost:5173",
			"http://localhost:4173",
			"http://localhost:4174",
		)
		// For localhost development, use "localhost" as RPID
		if rpID == "localhost" || rpID == "127.0.0.1" {
			rpID = "localhost"
		}
	}

	// Log WebAuthn configuration for debugging
	log.Printf("WebAuthn Configuration: RPID=%s, RPOrigins=%v", rpID, rpOrigins)

	wconfig := &webauthn.Config{
		RPDisplayName: "Schist",
		RPID:          rpID,
		RPOrigins:     rpOrigins,
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			RequireResidentKey: protocol.ResidentKeyRequired(),
			ResidentKey:        protocol.ResidentKeyRequirementRequired,
			UserVerification:   protocol.VerificationRequired,
		},
		Timeouts: webauthn.TimeoutsConfig{
			Login: webauthn.TimeoutConfig{
				Enforce:    true,
				Timeout:    time.Second * 60,
				TimeoutUVD: time.Second * 60,
			},
			Registration: webauthn.TimeoutConfig{
				Enforce:    true,
				Timeout:    time.Second * 60,
				TimeoutUVD: time.Second * 60,
			},
		},
	}

	webAuthn, err := webauthn.New(wconfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create WebAuthn instance: %w", err)
	}

	return &PasskeyService{
		dataDir:  config.DataDir,
		webauthn: webAuthn,
	}, nil
}

func (ps *PasskeyService) getStoragePath() string {
	return filepath.Join(ps.dataDir, ".schist", "passkeys.json")
}

func (ps *PasskeyService) loadCredentials() (*PasskeyStorage, error) {
	storagePath := ps.getStoragePath()

	if _, err := os.Stat(storagePath); os.IsNotExist(err) {
		return &PasskeyStorage{
			Version:     1,
			Credentials: []PasskeyCredential{},
		}, nil
	}

	data, err := os.ReadFile(storagePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read passkey storage: %w", err)
	}

	var storage PasskeyStorage
	if err := json.Unmarshal(data, &storage); err != nil {
		return nil, fmt.Errorf("failed to parse passkey storage: %w", err)
	}

	return &storage, nil
}

func (ps *PasskeyService) saveCredentials(storage *PasskeyStorage) error {
	storagePath := ps.getStoragePath()

	if err := os.MkdirAll(filepath.Dir(storagePath), 0755); err != nil {
		return fmt.Errorf("failed to create passkey directory: %w", err)
	}

	data, err := json.MarshalIndent(storage, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal passkey storage: %w", err)
	}

	if err := os.WriteFile(storagePath, data, 0600); err != nil {
		return fmt.Errorf("failed to write passkey storage: %w", err)
	}

	return nil
}

// getUser creates a PasskeyUser with all stored credentials
func (ps *PasskeyService) getUser() (*PasskeyUser, error) {
	storage, err := ps.loadCredentials()
	if err != nil {
		return nil, err
	}

	userID := []byte("schist-user") // Single user system
	credentials := make([]webauthn.Credential, len(storage.Credentials))

	for i, cred := range storage.Credentials {
		credentials[i] = webauthn.Credential{
			ID:              cred.CredentialID,
			PublicKey:       cred.PublicKey,
			AttestationType: cred.AttestationType,
			Transport:       convertStringSliceToTransports(cred.Transport),
			Flags: webauthn.CredentialFlags{
				UserPresent:    cred.Flags.UserPresent,
				UserVerified:   cred.Flags.UserVerified,
				BackupEligible: cred.Flags.BackupEligible,
				BackupState:    cred.Flags.BackupState,
			},
			Authenticator: webauthn.Authenticator{
				AAGUID:       cred.Authenticator.AAGUID,
				SignCount:    cred.Authenticator.SignCount,
				CloneWarning: cred.Authenticator.CloneWarning,
			},
		}
	}

	return &PasskeyUser{
		id:          userID,
		name:        "schist-user",
		displayName: "Schist User",
		credentials: credentials,
	}, nil
}

// BeginRegistration starts the passkey registration process
func (ps *PasskeyService) BeginRegistration(name string) (*protocol.CredentialCreation, *webauthn.SessionData, error) {
	user, err := ps.getUser()
	if err != nil {
		return nil, nil, err
	}

	registerOptions := func(credCreationOpts *protocol.PublicKeyCredentialCreationOptions) {
		credCreationOpts.CredentialExcludeList = convertCredentialsToDescriptors(user.WebAuthnCredentials())
	}

	options, session, err := ps.webauthn.BeginRegistration(user, registerOptions)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to begin registration: %w", err)
	}

	return options, session, nil
}

// FinishRegistration completes the passkey registration process
func (ps *PasskeyService) FinishRegistration(
	name string,
	session *webauthn.SessionData,
	response *protocol.ParsedCredentialCreationData,
) (string, error) {
	user, err := ps.getUser()
	if err != nil {
		return "", err
	}

	credential, err := ps.webauthn.CreateCredential(user, *session, response)
	if err != nil {
		return "", fmt.Errorf("failed to create credential: %w", err)
	}

	// Generate a key seed for this passkey (for encryption key derivation)
	keySeed := make([]byte, 32)
	if _, err := rand.Read(keySeed); err != nil {
		return "", fmt.Errorf("failed to generate key seed: %w", err)
	}

	// Create our storage credential
	passkeyCredential := PasskeyCredential{
		ID:              base64.URLEncoding.EncodeToString(credential.ID),
		Name:            name,
		CreatedAt:       time.Now(),
		CredentialID:    credential.ID,
		PublicKey:       credential.PublicKey,
		AttestationType: credential.AttestationType,
		Transport:       convertTransportsToStringSlice(credential.Transport),
		Flags: struct {
			UserPresent    bool `json:"userPresent"`
			UserVerified   bool `json:"userVerified"`
			BackupEligible bool `json:"backupEligible"`
			BackupState    bool `json:"backupState"`
		}{
			UserPresent:    credential.Flags.UserPresent,
			UserVerified:   credential.Flags.UserVerified,
			BackupEligible: credential.Flags.BackupEligible,
			BackupState:    credential.Flags.BackupState,
		},
		Authenticator: struct {
			AAGUID       []byte `json:"aaguid"`
			SignCount    uint32 `json:"signCount"`
			CloneWarning bool   `json:"cloneWarning"`
		}{
			AAGUID:       credential.Authenticator.AAGUID,
			SignCount:    credential.Authenticator.SignCount,
			CloneWarning: credential.Authenticator.CloneWarning,
		},
		KeySeed: keySeed,
	}

	// Save to storage
	storage, err := ps.loadCredentials()
	if err != nil {
		return "", err
	}

	storage.Credentials = append(storage.Credentials, passkeyCredential)
	if err := ps.saveCredentials(storage); err != nil {
		return "", err
	}

	return passkeyCredential.ID, nil
}

// BeginAuthentication starts the passkey authentication process
func (ps *PasskeyService) BeginAuthentication() (*protocol.CredentialAssertion, *webauthn.SessionData, error) {
	user, err := ps.getUser()
	if err != nil {
		return nil, nil, err
	}

	if len(user.credentials) == 0 {
		return nil, nil, fmt.Errorf("no passkeys registered")
	}

	options, session, err := ps.webauthn.BeginLogin(user)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to begin authentication: %w", err)
	}

	return options, session, nil
}

// FinishAuthentication completes the passkey authentication process
func (ps *PasskeyService) FinishAuthentication(
	session *webauthn.SessionData,
	response *protocol.ParsedCredentialAssertionData,
) (string, error) {
	user, err := ps.getUser()
	if err != nil {
		return "", err
	}

	credential, err := ps.webauthn.ValidateLogin(user, *session, response)
	if err != nil {
		return "", fmt.Errorf("failed to validate login: %w", err)
	}

	// Update the credential's sign count
	storage, err := ps.loadCredentials()
	if err != nil {
		return "", err
	}

	var credentialID string
	for i, cred := range storage.Credentials {
		if string(cred.CredentialID) == string(credential.ID) {
			storage.Credentials[i].Authenticator.SignCount = credential.Authenticator.SignCount
			credentialID = cred.ID
			break
		}
	}

	if credentialID == "" {
		return "", fmt.Errorf("credential not found in storage")
	}

	if err := ps.saveCredentials(storage); err != nil {
		return "", err
	}

	return credentialID, nil
}

// GetEncryptionKey derives an encryption key from a passkey
func (ps *PasskeyService) GetEncryptionKey(credentialID string) ([]byte, error) {
	storage, err := ps.loadCredentials()
	if err != nil {
		return nil, err
	}

	for _, cred := range storage.Credentials {
		if cred.ID == credentialID {
			return ps.deriveKeyFromSeed(cred.KeySeed)
		}
	}

	return nil, fmt.Errorf("credential not found")
}

func (ps *PasskeyService) deriveKeyFromSeed(keySeed []byte) ([]byte, error) {
	hkdfReader := hkdf.New(sha256.New, keySeed, nil, []byte("schist-secret-encryption"))

	key := make([]byte, 32)
	if _, err := io.ReadFull(hkdfReader, key); err != nil {
		return nil, fmt.Errorf("failed to derive key: %w", err)
	}

	return key, nil
}

// ListCredentials returns a list of registered passkey credentials
func (ps *PasskeyService) ListCredentials() ([]PasskeyCredentialInfo, error) {
	storage, err := ps.loadCredentials()
	if err != nil {
		return nil, err
	}

	result := make([]PasskeyCredentialInfo, len(storage.Credentials))
	for i, cred := range storage.Credentials {
		result[i] = PasskeyCredentialInfo{
			ID:        cred.ID,
			Name:      cred.Name,
			CreatedAt: cred.CreatedAt,
		}
	}

	return result, nil
}

// PasskeyCredentialInfo represents public information about a credential
type PasskeyCredentialInfo struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
}

// DeleteCredential removes a passkey credential
func (ps *PasskeyService) DeleteCredential(credentialID string) error {
	storage, err := ps.loadCredentials()
	if err != nil {
		return err
	}

	for i, cred := range storage.Credentials {
		if cred.ID == credentialID {
			storage.Credentials = append(storage.Credentials[:i], storage.Credentials[i+1:]...)
			return ps.saveCredentials(storage)
		}
	}

	return fmt.Errorf("credential not found")
}

// HasCredentials returns whether any passkey credentials are registered
func (ps *PasskeyService) HasCredentials() (bool, error) {
	storage, err := ps.loadCredentials()
	if err != nil {
		return false, err
	}

	return len(storage.Credentials) > 0, nil
}

// Helper functions for type conversions
func convertStringSliceToTransports(transports []string) []protocol.AuthenticatorTransport {
	result := make([]protocol.AuthenticatorTransport, len(transports))
	for i, t := range transports {
		result[i] = protocol.AuthenticatorTransport(t)
	}
	return result
}

func convertTransportsToStringSlice(transports []protocol.AuthenticatorTransport) []string {
	result := make([]string, len(transports))
	for i, t := range transports {
		result[i] = string(t)
	}
	return result
}

func convertCredentialsToDescriptors(credentials []webauthn.Credential) []protocol.CredentialDescriptor {
	result := make([]protocol.CredentialDescriptor, len(credentials))
	for i, cred := range credentials {
		result[i] = protocol.CredentialDescriptor{
			Type:         protocol.PublicKeyCredentialType,
			CredentialID: cred.ID,
			Transport:    cred.Transport,
		}
	}
	return result
}

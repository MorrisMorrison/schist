package services

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
)

// Personal access tokens: long-lived, revocable bearer tokens for the MCP
// endpoint and scripts. The raw token is shown once on creation; only its
// SHA-256 hash is stored.
const (
	APITokenPrefix = "sch_"

	TokenScopeRead      = "read"
	TokenScopeReadWrite = "read-write"

	maxTokensPerUser   = 25
	maxTokenNameLength = 64
	maxTokenExpiryDays = 365
	// lastUsedInterval limits how often a token's last-used time is written,
	// so a busy client doesn't rewrite the store on every request.
	lastUsedInterval = time.Minute
)

// APIToken is a stored token. Hash never leaves the server; use APITokenInfo
// in responses.
type APIToken struct {
	ID         string     `json:"id"`
	Username   string     `json:"username"`
	Name       string     `json:"name"`
	Prefix     string     `json:"prefix"`
	Hash       string     `json:"hash"`
	Scope      string     `json:"scope"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
}

// APITokenInfo is a token as clients see it.
type APITokenInfo struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Prefix     string     `json:"prefix"`
	Scope      string     `json:"scope"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
}

func (t APIToken) Info() APITokenInfo {
	return APITokenInfo{
		ID: t.ID, Name: t.Name, Prefix: t.Prefix, Scope: t.Scope,
		CreatedAt: t.CreatedAt, LastUsedAt: t.LastUsedAt, ExpiresAt: t.ExpiresAt,
	}
}

// CanWrite reports whether the token may change documents.
func (t APIToken) CanWrite() bool {
	return t.Scope == TokenScopeReadWrite
}

type TokenService struct {
	userService *UserService
	tokens      *jsonStore[[]APIToken]
	now         func() time.Time
}

func NewTokenService(dataDir string, userService *UserService) *TokenService {
	return &TokenService{
		userService: userService,
		tokens: &jsonStore[[]APIToken]{
			path:        filepath.Join(dataDir, appStateDir, "tokens.json"),
			perm:        0600,
			name:        "tokens file",
			empty:       func() []APIToken { return []APIToken{} },
			emptyFileOK: true,
		},
		now: time.Now,
	}
}

// IsAPIToken reports whether a bearer credential looks like a personal access
// token rather than a session JWT.
func IsAPIToken(credential string) bool {
	return strings.HasPrefix(credential, APITokenPrefix)
}

// Create issues a token for username and returns the raw token, which is
// never stored. expiresInDays 0 means the token doesn't expire.
func (s *TokenService) Create(username, name, scope string, expiresInDays int) (string, *APITokenInfo, error) {
	name = strings.TrimSpace(name)
	switch {
	case name == "":
		return "", nil, apierrors.NewMissingRequiredFieldError("name")
	case utf8.RuneCountInString(name) > maxTokenNameLength:
		return "", nil, apierrors.NewValidationError("Token name must be at most 64 characters")
	case scope != TokenScopeRead && scope != TokenScopeReadWrite:
		return "", nil, apierrors.NewValidationError(`Token scope must be "read" or "read-write"`)
	case expiresInDays < 0 || expiresInDays > maxTokenExpiryDays:
		return "", nil, apierrors.NewValidationError("Token expiry must be between 0 (never) and 365 days")
	}

	raw, err := randomString(32)
	if err != nil {
		return "", nil, err
	}
	raw = APITokenPrefix + raw
	id, err := randomHex(8)
	if err != nil {
		return "", nil, err
	}

	now := s.now().UTC()
	token := APIToken{
		ID:        id,
		Username:  username,
		Name:      name,
		Prefix:    raw[:len(APITokenPrefix)+6],
		Hash:      hashToken(raw),
		Scope:     scope,
		CreatedAt: now,
	}
	if expiresInDays > 0 {
		expires := now.AddDate(0, 0, expiresInDays)
		token.ExpiresAt = &expires
	}

	err = s.tokens.update(func(tokens *[]APIToken) error {
		count := 0
		for _, t := range *tokens {
			if t.Username == username {
				count++
			}
		}
		if count >= maxTokensPerUser {
			return apierrors.NewValidationError("You already have 25 tokens; revoke one first")
		}
		*tokens = append(*tokens, token)
		return nil
	})
	if err != nil {
		return "", nil, err
	}
	info := token.Info()
	return raw, &info, nil
}

// List returns username's tokens, newest first.
func (s *TokenService) List(username string) ([]APITokenInfo, error) {
	tokens, err := s.tokens.read()
	if err != nil {
		return nil, err
	}
	out := []APITokenInfo{}
	for _, t := range tokens {
		if t.Username == username {
			out = append(out, t.Info())
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

// Revoke deletes one of username's tokens. Another user's token is reported
// as not found, so ids can't be probed.
func (s *TokenService) Revoke(username, id string) error {
	return s.tokens.update(func(tokens *[]APIToken) error {
		for i, t := range *tokens {
			if t.ID == id && t.Username == username {
				*tokens = append((*tokens)[:i], (*tokens)[i+1:]...)
				return nil
			}
		}
		return apierrors.NewNotFoundError("token", id)
	})
}

// Validate returns the token for a raw credential, or an unauthorized error
// if it is unknown, expired or its user no longer exists.
func (s *TokenService) Validate(raw string) (*APIToken, error) {
	if !IsAPIToken(raw) {
		return nil, errInvalidAPIToken()
	}
	hash := hashToken(raw)
	now := s.now().UTC()

	var found *APIToken
	err := s.tokens.update(func(tokens *[]APIToken) error {
		for i := range *tokens {
			t := &(*tokens)[i]
			if subtle.ConstantTimeCompare([]byte(t.Hash), []byte(hash)) != 1 {
				continue
			}
			if t.ExpiresAt != nil && !now.Before(*t.ExpiresAt) {
				return errInvalidAPIToken()
			}
			copied := *t
			found = &copied
			if t.LastUsedAt != nil && now.Sub(*t.LastUsedAt) < lastUsedInterval {
				return errNoChange
			}
			t.LastUsedAt = &now
			return nil
		}
		return errInvalidAPIToken()
	})
	if err != nil && err != errNoChange {
		return nil, err
	}

	if _, err := s.userService.GetUserByUsername(found.Username); err != nil {
		if apierrors.HasCode(err, apierrors.ErrCodeNotFound) {
			return nil, errInvalidAPIToken()
		}
		return nil, err
	}
	return found, nil
}

// errNoChange aborts a store update without writing and without failing.
var errNoChange = apierrors.NewInternalError("no change")

func errInvalidAPIToken() error {
	return apierrors.NewUnauthorizedError("Invalid or expired token")
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func randomString(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

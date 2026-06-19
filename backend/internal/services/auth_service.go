package services

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/golang-jwt/jwt/v5"
)

// authTicketTTL is how long a single-use passkey-login ticket remains valid
// after a verified WebAuthn assertion before it must be exchanged for a JWT.
const authTicketTTL = 60 * time.Second

// authTicket is a short-lived, single-use proof that a WebAuthn assertion was
// verified for a given credential. It is exchanged for a JWT via
// LoginWithPasskeyTicket. It deliberately decouples the (public) credential ID
// from token issuance: a JWT is only ever minted after IssueAuthTicket has been
// called from the verified finish-authentication path.
type authTicket struct {
	credentialID string
	expiresAt    time.Time
}

type AuthService struct {
	config      *config.Config
	userService *UserService

	ticketMu sync.Mutex
	tickets  map[string]authTicket
}

// User is the response DTO for an authenticated user. It deliberately omits
// the sensitive fields on models.User (passkey ids, admin flag).
type User struct {
	Username  string    `json:"username"`
	CreatedAt time.Time `json:"created_at"`
	LastLogin time.Time `json:"last_login"`
}

// newUserDTO maps the internal user model to the User response DTO.
func newUserDTO(u *models.User) User {
	return User{
		Username:  u.Username,
		CreatedAt: u.CreatedAt,
		LastLogin: u.LastLogin,
	}
}

type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

var (
	ErrInvalidCredentials = errors.New("invalid username or password")
	ErrInvalidToken       = errors.New("invalid token")
)

func NewAuthService(config *config.Config, userService *UserService) *AuthService {
	return &AuthService{
		config:      config,
		userService: userService,
		tickets:     make(map[string]authTicket),
	}
}

// IssueAuthTicket mints a short-lived, single-use ticket bound to a credential
// ID that has just passed a verified WebAuthn assertion. The ticket is the only
// accepted proof for LoginWithPasskeyTicket. It MUST only be called from the
// finish-authentication path after the assertion has been validated.
func (s *AuthService) IssueAuthTicket(credentialId string) (string, error) {
	// Ensure the credential actually maps to a user before issuing a ticket.
	if _, err := s.userService.GetUserByCredentialID(credentialId); err != nil {
		return "", ErrInvalidCredentials
	}

	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("failed to generate auth ticket: %w", err)
	}
	ticket := base64.RawURLEncoding.EncodeToString(buf)

	s.ticketMu.Lock()
	s.pruneTicketsLocked()
	s.tickets[ticket] = authTicket{
		credentialID: credentialId,
		expiresAt:    time.Now().Add(authTicketTTL),
	}
	s.ticketMu.Unlock()

	return ticket, nil
}

// pruneTicketsLocked removes expired tickets. Caller must hold ticketMu.
func (s *AuthService) pruneTicketsLocked() {
	now := time.Now()
	for k, v := range s.tickets {
		if now.After(v.expiresAt) {
			delete(s.tickets, k)
		}
	}
}

// LoginWithPasskeyTicket exchanges a single-use auth ticket (produced by
// IssueAuthTicket after a verified assertion) for a JWT. A bare credential ID
// is never accepted as proof of authentication.
func (s *AuthService) LoginWithPasskeyTicket(ticket string) (*LoginResponse, error) {
	s.ticketMu.Lock()
	s.pruneTicketsLocked()
	entry, ok := s.tickets[ticket]
	if ok {
		// Single-use: consume immediately regardless of outcome.
		delete(s.tickets, ticket)
	}
	s.ticketMu.Unlock()

	if !ok || time.Now().After(entry.expiresAt) {
		return nil, ErrInvalidCredentials
	}

	// Find user by the verified credential ID.
	user, err := s.userService.GetUserByCredentialID(entry.credentialID)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	// Update last login time
	if err := s.userService.UpdateLastLogin(user.Username); err != nil {
		// Log error but don't fail login
		fmt.Printf("Warning: failed to update last login for user %s: %v\n", user.Username, err)
	}

	token, err := s.generateJWT(user.Username)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	authUser := newUserDTO(user)
	authUser.LastLogin = time.Now()

	return &LoginResponse{
		Token: token,
		User:  authUser,
	}, nil
}

func (s *AuthService) ValidateToken(tokenString string) (string, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.config.JWTSecret), nil
	},
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithIssuer("schist"),
		jwt.WithExpirationRequired(),
	)

	if err != nil {
		return "", ErrInvalidToken
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims.Username, nil
	}

	return "", ErrInvalidToken
}

func (s *AuthService) GetUser(username string) (*User, error) {
	user, err := s.userService.GetUserByUsername(username)
	if err != nil {
		return nil, errors.New("user not found")
	}

	dto := newUserDTO(user)
	return &dto, nil
}

func (s *AuthService) IsFirstSetup() (bool, error) {
	return s.userService.IsFirstSetup()
}

func (s *AuthService) CreateFirstUser(username, credentialId string) error {
	return s.userService.CreateFirstUser(username, credentialId)
}

func (s *AuthService) GenerateInviteToken(createdBy string) (string, error) {
	return s.userService.GenerateInviteToken(createdBy)
}

func (s *AuthService) CreateUserFromInvite(token, username, credentialId string) error {
	if err := s.userService.ConsumeInviteToken(token); err != nil {
		return err
	}

	return s.userService.CreateUser(username, false, credentialId)
}

func (s *AuthService) generateJWT(username string) (string, error) {
	claims := Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour * time.Duration(s.config.JWTExpiryHours))),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "schist",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.config.JWTSecret))
}

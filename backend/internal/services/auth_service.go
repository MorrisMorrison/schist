package services

import (
	"errors"
	"fmt"
	"time"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/golang-jwt/jwt/v5"
)

type AuthService struct {
	config      *config.Config
	userService *UserService
}

type User struct {
	Username  string    `json:"username"`
	CreatedAt time.Time `json:"created_at"`
	LastLogin time.Time `json:"last_login"`
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
	}
}

func (s *AuthService) LoginWithPasskey(credentialId string) (*LoginResponse, error) {
	// Find user by credential ID
	user, err := s.userService.GetUserByCredentialID(credentialId)
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

	authUser := User{
		Username:  user.Username,
		CreatedAt: user.CreatedAt,
		LastLogin: time.Now(),
	}

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
	})

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

	return &User{
		Username:  user.Username,
		CreatedAt: user.CreatedAt,
		LastLogin: user.LastLogin,
	}, nil
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

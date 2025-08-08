package services

import (
	"errors"
	"fmt"
	"time"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	config *config.Config
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

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

var (
	ErrInvalidCredentials = errors.New("invalid username or password")
	ErrMissingJWTSecret   = errors.New("JWT secret not configured")
	ErrInvalidToken       = errors.New("invalid token")
)

func NewAuthService(config *config.Config) *AuthService {
	return &AuthService{
		config: config,
	}
}

func (s *AuthService) Login(username, password string) (*LoginResponse, error) {
	fmt.Printf("DEBUG: Login attempt for username: %s\n", username)
	fmt.Printf("DEBUG: Available users: %v\n", func() []string {
		var users []string
		for user := range s.config.AuthUsers {
			users = append(users, user)
		}
		return users
	}())
	
	hashedPassword, exists := s.config.AuthUsers[username]
	if !exists {
		fmt.Printf("DEBUG: User %s not found in config\n", username)
		return nil, ErrInvalidCredentials
	}

	fmt.Printf("DEBUG: Hash from config: %s\n", hashedPassword)
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	if err != nil {
		fmt.Printf("DEBUG: Password comparison failed: %v\n", err)
		return nil, ErrInvalidCredentials
	}

	token, err := s.generateJWT(username)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	user := User{
		Username:  username,
		CreatedAt: time.Now(),
		LastLogin: time.Now(),
	}

	return &LoginResponse{
		Token: token,
		User:  user,
	}, nil
}

func (s *AuthService) ValidateToken(tokenString string) (string, error) {
	if s.config.JWTSecret == "" {
		return "", ErrMissingJWTSecret
	}

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
	if _, exists := s.config.AuthUsers[username]; !exists {
		return nil, errors.New("user not found")
	}

	return &User{
		Username:  username,
		CreatedAt: time.Now(),
		LastLogin: time.Now(),
	}, nil
}

func (s *AuthService) generateJWT(username string) (string, error) {
	if s.config.JWTSecret == "" {
		fmt.Printf("DEBUG: JWT secret is empty\n")
		return "", ErrMissingJWTSecret
	}
	fmt.Printf("DEBUG: Generating JWT for user: %s with secret length: %d\n", username, len(s.config.JWTSecret))

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

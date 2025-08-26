package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/gin-gonic/gin"
)

// MockUserService for testing
type MockUserService struct {
	users map[string]*models.User
}

func NewMockUserService() *MockUserService {
	return &MockUserService{
		users: make(map[string]*models.User),
	}
}

func (m *MockUserService) GetUserByUsername(username string) (*models.User, error) {
	user, exists := m.users[username]
	if !exists {
		return nil, fmt.Errorf("user not found")
	}
	return user, nil
}

func (m *MockUserService) AddUser(username string, isAdmin bool) {
	m.users[username] = &models.User{
		Username:   username,
		IsAdmin:    isAdmin,
		CreatedAt:  time.Now(),
		LastLogin:  time.Now(),
		PasskeyIDs: []string{"test-credential"},
	}
}

func TestAdminAuthMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name               string
		authenticatedUser  interface{}
		setupUser          func(*MockUserService)
		expectedStatus     int
		expectedErrorKey   string
		expectedMessageKey string
	}{
		{
			name:               "No authenticated user",
			authenticatedUser:  nil,
			setupUser:          func(m *MockUserService) {},
			expectedStatus:     http.StatusUnauthorized,
			expectedErrorKey:   "Unauthorized",
			expectedMessageKey: "Authentication required to access this resource",
		},
		{
			name:               "User not found",
			authenticatedUser:  "nonexistent",
			setupUser:          func(m *MockUserService) {},
			expectedStatus:     http.StatusUnauthorized,
			expectedErrorKey:   "Unauthorized",
			expectedMessageKey: "User not found",
		},
		{
			name:              "User exists but not admin",
			authenticatedUser: "regular_user",
			setupUser: func(m *MockUserService) {
				m.AddUser("regular_user", false)
			},
			expectedStatus:     http.StatusForbidden,
			expectedErrorKey:   "Forbidden",
			expectedMessageKey: "Admin privileges required to access this resource",
		},
		{
			name:              "User exists and is admin",
			authenticatedUser: "admin_user",
			setupUser: func(m *MockUserService) {
				m.AddUser("admin_user", true)
			},
			expectedStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			mockUserService := NewMockUserService()
			tt.setupUser(mockUserService)

			// Create a test router
			router := gin.New()
			router.Use(func(c *gin.Context) {
				if tt.authenticatedUser != nil {
					c.Set("authenticated_user", tt.authenticatedUser)
				}
				c.Next()
			})

			// Apply the admin middleware
			router.Use(AdminAuthMiddleware(mockUserService))

			// Add a test endpoint
			router.GET("/admin/test", func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"message": "success"})
			})

			// Make request
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("GET", "/admin/test", nil)
			router.ServeHTTP(w, req)

			// Assertions
			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			// For non-success cases, check error response
			if tt.expectedStatus != http.StatusOK {
				if w.Body.String() == "" {
					t.Error("Expected error response body, got empty")
				}
			}
		})
	}
}

func TestAdminAuthMiddleware_Integration(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Test that middleware chains properly with other middleware
	router := gin.New()

	// Simulate authentication middleware setting user
	router.Use(func(c *gin.Context) {
		c.Set("authenticated_user", "admin_user")
		c.Next()
	})

	mockUserService := NewMockUserService()
	mockUserService.AddUser("admin_user", true)

	// Apply admin middleware
	router.Use(AdminAuthMiddleware(mockUserService))

	// Test endpoint
	router.GET("/protected", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"data": "protected content"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/protected", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
	}
}

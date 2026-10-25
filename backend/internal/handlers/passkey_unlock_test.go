package handlers

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The unlock endpoint must demand proof of a verified passkey assertion (a
// single-use auth ticket), never a bare credential ID: credential IDs are not
// secret.
func TestUnlockWithPasskeyHandler_RequiresVerifiedTicket(t *testing.T) {
	gin.SetMode(gin.TestMode)

	userService := services.NewUserService(t.TempDir())
	require.NoError(t, userService.CreateFirstUser("alice", "cred-alice"))
	svc := &services.Services{
		AuthService: services.NewAuthService(&config.Config{JWTSecret: "test-secret", JWTExpiryHours: 24}, userService),
	}

	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("authenticated_user", "alice")
		c.Next()
	})
	router.POST("/unlock", UnlockWithPasskeyHandler(svc))

	tests := []struct {
		name   string
		body   string
		status int
	}{
		{"bare credential ID", `{"credentialId":"cred-alice"}`, http.StatusBadRequest},
		{"credential ID passed as a ticket", `{"authTicket":"cred-alice"}`, http.StatusUnauthorized},
		{"unknown ticket", `{"authTicket":"not-a-ticket"}`, http.StatusUnauthorized},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/unlock", bytes.NewBufferString(tt.body))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)
			assert.Equal(t, tt.status, w.Code, w.Body.String())
		})
	}
}

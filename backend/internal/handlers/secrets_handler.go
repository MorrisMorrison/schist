package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/MorrisMorrison/schist/internal/services"
)

// UnlockSecretsRequest removed - using passkey-only authentication

type CreateSecretRequest struct {
	Key   string `json:"key" binding:"required"`
	Value string `json:"value" binding:"required"`
}

type UpdateSecretRequest struct {
	Value string `json:"value" binding:"required"`
}

type SecretsStatusResponse struct {
	Unlocked         bool `json:"unlocked"`
	HasSecrets       bool `json:"has_secrets"`
	RequiresPassword bool `json:"requires_password"`
	HasPasskeys      bool `json:"has_passkeys"`
	RequiresSetup    bool `json:"requires_setup"`
}

type SecretListResponse struct {
	Secrets []string `json:"secrets"`
}

// UnlockSecretsHandler removed - using passkey-based unlock through UnlockWithPasskeyHandler

func SecretsStatusHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		hasPasskeys, _ := services.SecretManager.HasPasskeys()

		status := SecretsStatusResponse{
			Unlocked:         services.SecretManager.IsUnlocked(),
			HasSecrets:       services.SecretManager.HasSecrets(),
			RequiresPassword: services.SecretManager.RequiresPassword(),
			HasPasskeys:      hasPasskeys,
			RequiresSetup:    services.SecretManager.RequiresSetup(),
		}

		c.JSON(http.StatusOK, status)
	}
}

func ListSecretsHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !services.SecretManager.IsUnlocked() {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Secret store is locked"})
			return
		}

		secrets, err := services.SecretManager.ListSecrets()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		response := SecretListResponse{
			Secrets: secrets,
		}

		c.JSON(http.StatusOK, response)
	}
}

func CreateSecretHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !services.SecretManager.IsUnlocked() {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Secret store is locked"})
			return
		}

		var req CreateSecretRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if req.Key == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Key is required"})
			return
		}

		err := services.SecretManager.SetSecret(req.Key, req.Value)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"message": "Secret created successfully"})
	}
}

func UpdateSecretHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !services.SecretManager.IsUnlocked() {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Secret store is locked"})
			return
		}

		key := c.Param("key")
		if key == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Key parameter is required"})
			return
		}

		var req UpdateSecretRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		err := services.SecretManager.SetSecret(key, req.Value)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Secret updated successfully"})
	}
}

func DeleteSecretHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !services.SecretManager.IsUnlocked() {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Secret store is locked"})
			return
		}

		key := c.Param("key")
		if key == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Key parameter is required"})
			return
		}

		err := services.SecretManager.DeleteSecret(key)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Secret deleted successfully"})
	}
}

func LockSecretsHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		services.SecretManager.Lock()
		c.JSON(http.StatusOK, gin.H{"message": "Secret store locked"})
	}
}

func GetSecretHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !services.SecretManager.IsUnlocked() {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Secret store is locked"})
			return
		}

		key := c.Param("key")
		if key == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Key parameter is required"})
			return
		}

		value, err := services.SecretManager.GetSecret(key)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Secret not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"value": value})
	}
}

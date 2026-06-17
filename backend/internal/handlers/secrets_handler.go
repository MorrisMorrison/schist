package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/MorrisMorrison/schist/internal/errors"
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

// RequireUnlockedSecrets aborts the request with 401 when the secret store is
// locked. Applied to the secret read/write routes so each handler no longer has
// to repeat the unlock check.
func RequireUnlockedSecrets(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !services.SecretManager.IsUnlocked() {
			HandleError(c, errors.NewUnauthorizedError("Secret store is locked"))
			c.Abort()
			return
		}
		c.Next()
	}
}

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
		secrets, err := services.SecretManager.ListSecrets()
		if err != nil {
			HandleError(c, errors.NewInternalError(err.Error()).WithCause(err))
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
		var req CreateSecretRequest
		if apiErr := ValidateJSONBody(c, &req); apiErr != nil {
			HandleError(c, apiErr)
			return
		}

		if req.Key == "" {
			HandleError(c, errors.NewMissingRequiredFieldError("key"))
			return
		}

		err := services.SecretManager.SetSecret(req.Key, req.Value)
		if err != nil {
			HandleError(c, errors.NewInternalError(err.Error()).WithCause(err))
			return
		}

		c.JSON(http.StatusCreated, gin.H{"message": "Secret created successfully"})
	}
}

func UpdateSecretHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.Param("key")
		if key == "" {
			HandleError(c, errors.NewMissingRequiredFieldError("key"))
			return
		}

		var req UpdateSecretRequest
		if apiErr := ValidateJSONBody(c, &req); apiErr != nil {
			HandleError(c, apiErr)
			return
		}

		err := services.SecretManager.SetSecret(key, req.Value)
		if err != nil {
			HandleError(c, errors.NewInternalError(err.Error()).WithCause(err))
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Secret updated successfully"})
	}
}

func DeleteSecretHandler(services *services.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.Param("key")
		if key == "" {
			HandleError(c, errors.NewMissingRequiredFieldError("key"))
			return
		}

		err := services.SecretManager.DeleteSecret(key)
		if err != nil {
			HandleError(c, errors.NewInternalError(err.Error()).WithCause(err))
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
		key := c.Param("key")
		if key == "" {
			HandleError(c, errors.NewMissingRequiredFieldError("key"))
			return
		}

		value, err := services.SecretManager.GetSecret(key)
		if err != nil {
			HandleError(c, errors.NewNotFoundError("secret", key).WithCause(err))
			return
		}

		c.JSON(http.StatusOK, gin.H{"value": value})
	}
}

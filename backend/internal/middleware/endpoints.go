package middleware

import "strings"

// PublicEndpoints defines all endpoints that don't require authentication
// This is the single source of truth for public endpoints used across middleware
var PublicEndpoints = []string{
	"/api/health",
	"/api/config",
	"/api/auth/login",
	"/api/auth/logout",
	"/api/auth/login/passkey",
	"/api/auth/setup/required",
	"/api/auth/setup/first-user",
	"/api/auth/setup/invite-user",
	"/api/passkeys/register/begin",
	"/api/passkeys/register/finish",
	"/api/passkeys/authenticate/begin",
	"/api/passkeys/authenticate/finish",
}

// IsPublicEndpoint checks if a given path is a public endpoint
func IsPublicEndpoint(path string) bool {
	for _, endpoint := range PublicEndpoints {
		if path == endpoint {
			return true
		}
	}

	// Check for prefix-based patterns
	if strings.HasPrefix(path, "/api/auth/setup/") ||
		strings.HasPrefix(path, "/api/passkeys/") {
		return true
	}

	return false
}

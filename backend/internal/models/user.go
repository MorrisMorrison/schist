package models

import (
	"time"
)

// User represents a user in the system
type User struct {
	Username   string    `json:"username"`
	PasskeyIDs []string  `json:"passkey_ids"`
	IsAdmin    bool      `json:"is_admin"`
	CreatedAt  time.Time `json:"created_at"`
	LastLogin  time.Time `json:"last_login"`
}

// UserStorage represents the structure of the users.json file
type UserStorage struct {
	Users []User `json:"users"`
}

// UserInvite represents a pending user invitation
type UserInvite struct {
	Token     string    `json:"token"`
	Username  string    `json:"username"`
	IsAdmin   bool      `json:"is_admin"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedBy string    `json:"created_by"`
}

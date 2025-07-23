package main

import (
	"fmt"
	"log"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: generate-hash <password>")
		fmt.Println("Generates a bcrypt hash for use with SCHIST_AUTH_USERS")
		os.Exit(1)
	}

	password := os.Args[1]
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal("Error generating hash:", err)
	}

	fmt.Printf("Password hash: %s\n", string(hash))
	fmt.Printf("Environment variable example:\n")
	fmt.Printf("SCHIST_AUTH_USERS=\"admin:%s\"\n", string(hash))
}

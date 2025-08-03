package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/handlers"
	"github.com/MorrisMorrison/schist/internal/middleware"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	config := config.Load()

	// dev logging: timestamp + filename:line
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	if !config.IsDevelopment() {
		// prod logging: timestamp only
		log.SetFlags(log.LstdFlags)
		gin.SetMode(gin.ReleaseMode)
	}

	initDataDir(config)

	router := gin.Default()

	setupCORS(router, config)
	setupMiddleware(router, config)

	apiHandler := handlers.NewAPIHandler()
	staticHandler := handlers.NewStaticHandler(config.StaticDir)

	api := router.Group("/api")
	apiHandler.SetupAPIRoutes(api)

	// Serve user-uploaded assets from data directory
	router.Static("/uploads", filepath.Join(config.DataDir, "assets"))

	if !config.IsDevelopment() {
		staticHandler.SetupStaticRoutes(router)
	}

	port := fmt.Sprintf(":%s", config.Port)
	log.Printf("Starting Schist server on port %s (env: %s)", config.Port, config.Environment)

	if err := router.Run(port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func initDataDir(config *config.Config) {
	log.Printf("creating dataDir %s", config.DataDir)
	// 0755 = read/write/execute for owner, read/execute for others
	permissions := 0755
	if err := os.MkdirAll(config.DataDir, os.FileMode(permissions)); err != nil {
		log.Fatalf("could not create data directory %s", config.DataDir)
	}

	log.Printf("dataDir %s successfully created", config.DataDir)
}

func setupCORS(router *gin.Engine, config *config.Config) {
	if !config.IsDevelopment() {
		return
	}

	// Development: Allow frontend dev server
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{config.FrontendURL},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"},
		AllowCredentials: true,
	}))
	log.Printf("CORS enabled for development: %s", config.FrontendURL)
}

func setupMiddleware(router *gin.Engine, config *config.Config) {
	// Rate limiting middleware
	if config.RateLimitEnabled {
		router.Use(middleware.RateLimitMiddleware(config.RateLimitRPM))
		log.Printf("Rate limiting enabled: %d requests per minute", config.RateLimitRPM)
	}

	// Basic authentication middleware
	if config.AuthEnabled {
		router.Use(middleware.BasicAuthMiddleware(config.AuthUsers, config.AuthRealm))
		log.Printf("Basic authentication enabled for all endpoints (realm: %s)", config.AuthRealm)
	}
}

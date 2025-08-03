package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/handlers"
	"github.com/MorrisMorrison/schist/internal/middleware"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize all services with proper dependency injection
	services, err := services.NewServices()
	if err != nil {
		log.Fatalf("Failed to initialize services: %v", err)
	}

	// dev logging: timestamp + filename:line
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	if !services.Config.IsDevelopment() {
		// prod logging: timestamp only
		log.SetFlags(log.LstdFlags)
		gin.SetMode(gin.ReleaseMode)
	}

	initDataDir(services.Config)

	router := gin.Default()

	setupCORS(router, services.Config)
	setupMiddleware(router, services.Config)

	apiHandler := handlers.NewAPIHandler(services)
	staticHandler := handlers.NewStaticHandler(services.Config.StaticDir)

	api := router.Group("/api")
	apiHandler.SetupAPIRoutes(api)

	// Serve user-uploaded assets from data directory
	router.Static("/uploads", filepath.Join(services.Config.DataDir, "assets"))

	if !services.Config.IsDevelopment() {
		staticHandler.SetupStaticRoutes(router)
	}

	port := fmt.Sprintf(":%s", services.Config.Port)
	log.Printf("Starting Schist server on port %s (env: %s)", services.Config.Port, services.Config.Environment)

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

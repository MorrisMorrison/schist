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
	cfg := config.Load()

	// dev logging: timestamp + filename:line
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	if !cfg.IsDevelopment() {
		// prod logging: timestamp only
		log.SetFlags(log.LstdFlags)
		gin.SetMode(gin.ReleaseMode)
	}

	initDataDir(cfg)

	router := gin.Default()

	setupCORS(router, cfg)
	setupMiddleware(router, cfg)

	apiHandler := handlers.NewAPIHandler()
	staticHandler := handlers.NewStaticHandler(cfg.StaticDir)

	api := router.Group("/api")
	apiHandler.SetupAPIRoutes(api)

	// Serve user-uploaded assets from data directory
	router.Static("/uploads", filepath.Join(cfg.DataDir, "assets"))

	if !cfg.IsDevelopment() {
		staticHandler.SetupStaticRoutes(router)
	}

	port := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Starting Schist server on port %s (env: %s)", cfg.Port, cfg.Environment)

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

func setupCORS(router *gin.Engine, cfg *config.Config) {
	if !cfg.IsDevelopment() {
		return
	}

	// Development: Allow frontend dev server
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.FrontendURL},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"},
		AllowCredentials: true,
	}))
	log.Printf("CORS enabled for development: %s", cfg.FrontendURL)
}

func setupMiddleware(router *gin.Engine, cfg *config.Config) {
	// Rate limiting middleware
	if cfg.RateLimitEnabled {
		router.Use(middleware.RateLimitMiddleware(cfg.RateLimitRPM))
		log.Printf("Rate limiting enabled: %d requests per minute", cfg.RateLimitRPM)
	}

	// Basic authentication middleware
	if cfg.AuthEnabled {
		router.Use(middleware.BasicAuthMiddleware(cfg.AuthUsers, cfg.AuthRealm))
		log.Printf("Basic authentication enabled for all endpoints (realm: %s)", cfg.AuthRealm)
	}
}
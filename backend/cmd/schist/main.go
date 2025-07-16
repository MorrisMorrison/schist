package main

import (
	"fmt"
	"log"
	"os"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/handlers"
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

	r := gin.Default()

	setupCORS(r, cfg)

	apiHandler := handlers.NewAPIHandler()
	staticHandler := handlers.NewStaticHandler(cfg.StaticDir)

	api := r.Group("/api")
	apiHandler.SetupAPIRoutes(api)

	if !cfg.IsDevelopment() {
		staticHandler.SetupStaticRoutes(r)
	}

	port := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Starting Schist server on port %s (env: %s)", cfg.Port, cfg.Environment)

	if err := r.Run(port); err != nil {
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

func setupCORS(r *gin.Engine, cfg *config.Config) {
	if cfg.IsDevelopment() {
		// Development: Allow frontend dev server
		r.Use(cors.New(cors.Config{
			AllowOrigins:     []string{cfg.FrontendURL},
			AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
			ExposeHeaders:    []string{"Content-Length"},
			AllowCredentials: true,
		}))
		log.Printf("CORS enabled for development: %s", cfg.FrontendURL)
	} else {
		// Production: Restrictive CORS
		r.Use(cors.New(cors.Config{
			AllowOrigins: []string{"*"},
			AllowMethods: []string{"GET", "POST", "PUT", "DELETE"},
			AllowHeaders: []string{"Origin", "Content-Type", "Accept"},
		}))
	}
}

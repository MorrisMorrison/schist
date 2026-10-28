package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/handlers"
	"github.com/MorrisMorrison/schist/internal/middleware"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	services, err := services.NewServices()
	if err != nil {
		log.Fatalf("Failed to initialize services: %v", err)
	}

	log.SetFlags(log.LstdFlags | log.Lshortfile)

	if !services.Config.IsDevelopment() {
		log.SetFlags(log.LstdFlags)
		gin.SetMode(gin.ReleaseMode)
	}

	initDataDir(services.Config)

	// Use gin.New() instead of gin.Default() so we control the recovery
	// middleware: RecoverMiddleware converts panics into structured APIErrors
	// (gin's default recovery only returns a bare 500).
	router := gin.New()
	router.Use(gin.Logger())
	router.Use(handlers.RecoverMiddleware())

	setupCORS(router, services.Config)
	setupMiddleware(router, services)

	apiHandler := handlers.NewAPIHandler(services)
	staticHandler := handlers.NewStaticHandler(services.Config.StaticDir)

	api := router.Group("/api")
	apiHandler.SetupAPIRoutes(api)

	router.Static("/uploads", filepath.Join(services.Config.DataDir, "assets"))

	if !services.Config.IsDevelopment() {
		staticHandler.SetupStaticRoutes(router)
	}

	port := fmt.Sprintf(":%s", services.Config.Port)
	srv := &http.Server{
		Addr:    port,
		Handler: router,
	}

	// Listen for interrupt/terminate signals to trigger a graceful shutdown.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("Starting Schist server on port %s (env: %s)", services.Config.Port, services.Config.Environment)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	<-ctx.Done()
	stop()
	log.Printf("Shutdown signal received, draining in-flight requests...")

	// Give in-flight requests (and go-git working-tree commits) time to finish.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Printf("Server stopped cleanly")
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

	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{config.FrontendURL},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"},
		AllowCredentials: true,
	}))
	log.Printf("CORS enabled for development: %s", config.FrontendURL)
}

func setupMiddleware(router *gin.Engine, services *services.Services) {
	// ValidationMiddleware extracts the X-Request-ID (so logError can attach
	// request_id) and drains c.Errors into structured responses after handlers.
	router.Use(handlers.ValidationMiddleware())

	router.Use(middleware.SecurityMiddleware(services.Config))
	log.Printf("Security headers enabled")

	if services.Config.RateLimitEnabled {
		router.Use(middleware.RateLimitMiddleware(services.Config.RateLimitRPM))
		log.Printf("Rate limiting enabled: %d requests per minute", services.Config.RateLimitRPM)
	}

	router.Use(middleware.JWTMiddleware(services.AuthService, services.TokenService, services.Config))
	if services.Config.AuthEnabled {
		log.Printf("JWT authentication enabled for all endpoints")
	} else {
		log.Printf("Authentication disabled - all endpoints accessible")
	}
}

package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port        string
	DataDir     string
	Environment string
	StaticDir   string
	FrontendURL string
}

func Load() *Config {
	return &Config{
		Port:        getEnv("SCHIST_PORT", "8080"),
		DataDir:     getEnv("SCHIST_DATA_DIR", "./data"),
		Environment: getEnv("NODE_ENV", "development"),
		StaticDir:   getEnv("SCHIST_STATIC_DIR", "./web"),
		FrontendURL: getEnv("SCHIST_FRONTEND_URL", "http://localhost:5173"),
	}
}

func (c *Config) IsDevelopment() bool {
	return c.Environment == "development"
}

func (c *Config) GetPort() int {
	port, err := strconv.Atoi(c.Port)
	if err != nil {
		return 8080
	}
	return port
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

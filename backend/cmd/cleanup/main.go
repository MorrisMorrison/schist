package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type CleanupConfig struct {
	DataDirectories []string `json:"data_directories"`
	TestDirectories []string `json:"test_directories"`
	E2EResults      []string `json:"e2e_results"`
	LogFiles        []string `json:"log_files"`
	TempFiles       []string `json:"temp_files"`
	SearchPatterns  []string `json:"search_patterns"`
}

type CleanupStats struct {
	FilesDeleted      int
	DirectoriesDeleted int
	BytesFreed        int64
	Errors           []string
}

func main() {
	var configPath = flag.String("config", "cleanup-config.json", "Path to cleanup configuration file")
	var dryRun = flag.Bool("dry-run", false, "Show what would be deleted without actually deleting")
	var verbose = flag.Bool("verbose", false, "Show detailed output")
	var searchMode = flag.Bool("search", false, "Auto-discover cleanup targets by searching")
	var rootDir = flag.String("root", ".", "Root directory to search from")
	flag.Parse()

	fmt.Println("🧹 Schist Data Cleanup Tool")
	fmt.Println("==========================")

	var config CleanupConfig
	var err error

	if *searchMode {
		fmt.Println("🔍 Auto-discovering cleanup targets...")
		config = autoDiscoverTargets(*rootDir)
	} else {
		config, err = loadConfig(*configPath)
		if err != nil {
			fmt.Printf("❌ Error loading config: %v\n", err)
			os.Exit(1)
		}
	}

	if *verbose {
		fmt.Printf("📋 Cleanup configuration:\n")
		configJSON, _ := json.MarshalIndent(config, "", "  ")
		fmt.Println(string(configJSON))
	}

	stats := CleanupStats{}
	
	if *dryRun {
		fmt.Println("🔍 DRY RUN MODE - No files will be deleted")
	}

	// Clean up data directories
	fmt.Println("\n📂 Cleaning data directories...")
	for _, dir := range config.DataDirectories {
		cleanupDirectory(dir, *dryRun, *verbose, &stats)
	}

	// Clean up test directories
	fmt.Println("\n🧪 Cleaning test directories...")
	for _, dir := range config.TestDirectories {
		cleanupDirectory(dir, *dryRun, *verbose, &stats)
	}

	// Clean up E2E results
	fmt.Println("\n🎭 Cleaning E2E test results...")
	for _, pattern := range config.E2EResults {
		cleanupPattern(pattern, *dryRun, *verbose, &stats)
	}

	// Clean up log files
	fmt.Println("\n📝 Cleaning log files...")
	for _, pattern := range config.LogFiles {
		cleanupPattern(pattern, *dryRun, *verbose, &stats)
	}

	// Clean up temp files
	fmt.Println("\n🗂️ Cleaning temp files...")
	for _, pattern := range config.TempFiles {
		cleanupPattern(pattern, *dryRun, *verbose, &stats)
	}

	// Clean up search patterns
	if len(config.SearchPatterns) > 0 {
		fmt.Println("\n🔎 Cleaning search patterns...")
		for _, pattern := range config.SearchPatterns {
			cleanupPattern(pattern, *dryRun, *verbose, &stats)
		}
	}

	// Print summary
	printSummary(stats, *dryRun)
}

func loadConfig(configPath string) (CleanupConfig, error) {
	var config CleanupConfig

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// Create default config if it doesn't exist
		config = getDefaultConfig()
		if err := saveConfig(configPath, config); err != nil {
			return config, fmt.Errorf("failed to save default config: %w", err)
		}
		fmt.Printf("📄 Created default config at: %s\n", configPath)
		return config, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return config, fmt.Errorf("failed to read config file: %w", err)
	}

	if err := json.Unmarshal(data, &config); err != nil {
		return config, fmt.Errorf("failed to parse config JSON: %w", err)
	}

	return config, nil
}

func saveConfig(configPath string, config CleanupConfig) error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, data, 0644)
}

func getDefaultConfig() CleanupConfig {
	return CleanupConfig{
		DataDirectories: []string{
			"data",
			"test-data",
			"e2e-data",
			"tmp/schist-*",
		},
		TestDirectories: []string{
			"frontend/test-results",
			"frontend/playwright-report",
			"frontend/coverage",
			"backend/coverage",
			"backend/test-results",
		},
		E2EResults: []string{
			"frontend/test-results/**",
			"frontend/playwright-report/**",
			"frontend/e2e-results/**",
			"**/playwright-report/**",
			"**/test-results/**",
		},
		LogFiles: []string{
			"*.log",
			"logs/**",
			"backend/*.log",
			"frontend/*.log",
			"backend/logs/**",
			"frontend/logs/**",
		},
		TempFiles: []string{
			"*.tmp",
			"*.temp",
			".tmp/**",
			"tmp/**",
			"/tmp/schist-*",
			"/var/tmp/schist-*",
		},
		SearchPatterns: []string{
			"**/node_modules/.cache/**",
			"**/.svelte-kit/output/**",
			"**/dist/**",
			"**/build/**",
		},
	}
}

func autoDiscoverTargets(rootDir string) CleanupConfig {
	config := CleanupConfig{
		DataDirectories: []string{},
		TestDirectories: []string{},
		E2EResults:      []string{},
		LogFiles:        []string{},
		TempFiles:       []string{},
		SearchPatterns:  []string{},
	}

	// Walk the directory tree to find cleanup targets
	filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if !info.IsDir() {
			return nil
		}

		name := info.Name()
		
		// Data directories
		if name == "data" || name == "test-data" || name == "e2e-data" || strings.HasPrefix(name, "schist-data") {
			config.DataDirectories = append(config.DataDirectories, path)
		}

		// Test result directories
		if name == "test-results" || name == "playwright-report" || name == "coverage" {
			config.TestDirectories = append(config.TestDirectories, path)
		}

		return nil
	})

	// Add common patterns
	config.E2EResults = []string{
		"**/test-results/**",
		"**/playwright-report/**",
	}
	
	config.LogFiles = []string{
		"*.log",
		"**/logs/**",
	}

	config.TempFiles = []string{
		"*.tmp",
		"*.temp",
		"tmp/**",
	}

	return config
}

func cleanupDirectory(dirPath string, dryRun, verbose bool, stats *CleanupStats) {
	// Handle glob patterns
	if strings.Contains(dirPath, "*") {
		matches, err := filepath.Glob(dirPath)
		if err != nil {
			stats.Errors = append(stats.Errors, fmt.Sprintf("Failed to glob %s: %v", dirPath, err))
			return
		}
		for _, match := range matches {
			cleanupSingleDirectory(match, dryRun, verbose, stats)
		}
	} else {
		cleanupSingleDirectory(dirPath, dryRun, verbose, stats)
	}
}

func cleanupSingleDirectory(dirPath string, dryRun, verbose bool, stats *CleanupStats) {
	if _, err := os.Stat(dirPath); os.IsNotExist(err) {
		if verbose {
			fmt.Printf("  ⏭️  %s (does not exist)\n", dirPath)
		}
		return
	}

	// Calculate size before deletion
	size := getDirSize(dirPath)
	fileCount := getFileCount(dirPath)

	if dryRun {
		fmt.Printf("  🔍 Would delete: %s (%d files, %s)\n", dirPath, fileCount, formatBytes(size))
		return
	}

	if err := os.RemoveAll(dirPath); err != nil {
		stats.Errors = append(stats.Errors, fmt.Sprintf("Failed to delete %s: %v", dirPath, err))
		fmt.Printf("  ❌ Error deleting: %s (%v)\n", dirPath, err)
		return
	}

	stats.DirectoriesDeleted++
	stats.FilesDeleted += fileCount
	stats.BytesFreed += size

	if verbose {
		fmt.Printf("  ✅ Deleted: %s (%d files, %s)\n", dirPath, fileCount, formatBytes(size))
	} else {
		fmt.Printf("  ✅ %s\n", dirPath)
	}
}

func cleanupPattern(pattern string, dryRun, verbose bool, stats *CleanupStats) {
	matches, err := filepath.Glob(pattern)
	if err != nil {
		stats.Errors = append(stats.Errors, fmt.Sprintf("Failed to glob %s: %v", pattern, err))
		return
	}

	if len(matches) == 0 {
		if verbose {
			fmt.Printf("  ⏭️  %s (no matches)\n", pattern)
		}
		return
	}

	for _, match := range matches {
		info, err := os.Stat(match)
		if err != nil {
			continue
		}

		if info.IsDir() {
			cleanupSingleDirectory(match, dryRun, verbose, stats)
		} else {
			cleanupSingleFile(match, dryRun, verbose, stats)
		}
	}
}

func cleanupSingleFile(filePath string, dryRun, verbose bool, stats *CleanupStats) {
	info, err := os.Stat(filePath)
	if err != nil {
		return
	}

	size := info.Size()

	if dryRun {
		fmt.Printf("  🔍 Would delete: %s (%s)\n", filePath, formatBytes(size))
		return
	}

	if err := os.Remove(filePath); err != nil {
		stats.Errors = append(stats.Errors, fmt.Sprintf("Failed to delete %s: %v", filePath, err))
		fmt.Printf("  ❌ Error deleting: %s (%v)\n", filePath, err)
		return
	}

	stats.FilesDeleted++
	stats.BytesFreed += size

	if verbose {
		fmt.Printf("  ✅ Deleted: %s (%s)\n", filePath, formatBytes(size))
	}
}

func getDirSize(dirPath string) int64 {
	var size int64
	filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size
}

func getFileCount(dirPath string) int {
	var count int
	filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			count++
		}
		return nil
	})
	return count
}

func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

func printSummary(stats CleanupStats, dryRun bool) {
	fmt.Println("\n📊 Cleanup Summary")
	fmt.Println("==================")
	
	if dryRun {
		fmt.Println("🔍 DRY RUN RESULTS:")
	} else {
		fmt.Println("✅ CLEANUP COMPLETED:")
	}
	
	fmt.Printf("📁 Directories: %d\n", stats.DirectoriesDeleted)
	fmt.Printf("📄 Files: %d\n", stats.FilesDeleted)
	fmt.Printf("💾 Space freed: %s\n", formatBytes(stats.BytesFreed))
	
	if len(stats.Errors) > 0 {
		fmt.Printf("\n⚠️  Errors encountered: %d\n", len(stats.Errors))
		for _, err := range stats.Errors {
			fmt.Printf("  • %s\n", err)
		}
	}

	if dryRun {
		fmt.Println("\n💡 Run without --dry-run to actually delete these files")
	}
}
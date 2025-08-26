package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type CleanupProfile struct {
	DataDirectories []string `json:"data_directories"`
	TestDirectories []string `json:"test_directories"`
	E2EResults      []string `json:"e2e_results"`
	LogFiles        []string `json:"log_files"`
	TempFiles       []string `json:"temp_files"`
	SearchPatterns  []string `json:"search_patterns"`
	SystemCleanup   bool     `json:"system_cleanup"`
}

type CleanupConfig struct {
	Profiles       map[string]CleanupProfile `json:"profiles"`
	DefaultProfile string                    `json:"default_profile"`
}

type CleanupStats struct {
	FilesDeleted       int
	DirectoriesDeleted int
	BytesFreed         int64
	Errors             []string
}

func main() {
	var configPath = flag.String("config", "cleanup-config.json", "Path to cleanup configuration file")
	var profile = flag.String("profile", "", "Cleanup profile to use")
	var dryRun = flag.Bool("dry-run", false, "Show what would be deleted without actually deleting")
	var verbose = flag.Bool("verbose", false, "Show detailed output")
	var searchMode = flag.Bool("search", false, "Auto-discover cleanup targets by searching")
	var rootDir = flag.String("root", ".", "Root directory to search from")
	flag.Parse()

	fmt.Println("🧹 Schist Data Cleanup Tool")
	fmt.Println("==========================")

	var activeProfile CleanupProfile
	var err error

	if *searchMode {
		fmt.Println("🔍 Auto-discovering cleanup targets...")
		activeProfile = autoDiscoverTargets(*rootDir)
	} else {
		activeProfile, err = loadProfile(*configPath, *profile)
		if err != nil {
			fmt.Printf("❌ Error loading profile: %v\n", err)
			os.Exit(1)
		}
	}

	if *verbose {
		fmt.Printf("📋 Active cleanup profile:\n")
		profileJSON, _ := json.MarshalIndent(activeProfile, "", "  ")
		fmt.Println(string(profileJSON))
	}

	stats := CleanupStats{}

	if *dryRun {
		fmt.Println("🔍 DRY RUN MODE - No files will be deleted")
	}

	// Clean up data directories
	fmt.Println("\n📂 Cleaning data directories...")
	for _, dir := range activeProfile.DataDirectories {
		cleanupDirectory(dir, *dryRun, *verbose, &stats)
	}

	// Clean up test directories
	fmt.Println("\n🧪 Cleaning test directories...")
	for _, dir := range activeProfile.TestDirectories {
		cleanupDirectory(dir, *dryRun, *verbose, &stats)
	}

	// Clean up E2E results
	fmt.Println("\n🎭 Cleaning E2E test results...")
	for _, pattern := range activeProfile.E2EResults {
		cleanupPattern(pattern, *dryRun, *verbose, &stats)
	}

	// Clean up log files
	fmt.Println("\n📝 Cleaning log files...")
	for _, pattern := range activeProfile.LogFiles {
		cleanupPattern(pattern, *dryRun, *verbose, &stats)
	}

	// Clean up temp files
	fmt.Println("\n🗂️ Cleaning temp files...")
	for _, pattern := range activeProfile.TempFiles {
		cleanupPattern(pattern, *dryRun, *verbose, &stats)
	}

	// Clean up search patterns
	if len(activeProfile.SearchPatterns) > 0 {
		fmt.Println("\n🔎 Cleaning search patterns...")
		for _, pattern := range activeProfile.SearchPatterns {
			cleanupPattern(pattern, *dryRun, *verbose, &stats)
		}
	}

	// Print summary
	printSummary(stats, *dryRun)
}

func loadProfile(configPath string, profileName string) (CleanupProfile, error) {
	var profile CleanupProfile

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// Create default config if it doesn't exist
		config := getDefaultConfig()
		if err := saveConfig(configPath, config); err != nil {
			return profile, fmt.Errorf("failed to save default config: %w", err)
		}
		fmt.Printf("📄 Created default config at: %s\n", configPath)

		// Use default profile
		if profileName == "" {
			profileName = config.DefaultProfile
		}

		if selectedProfile, exists := config.Profiles[profileName]; exists {
			return selectedProfile, nil
		}
		return profile, fmt.Errorf("profile '%s' not found in default config", profileName)
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return profile, fmt.Errorf("failed to read config file: %w", err)
	}

	// Try to parse as new format first
	var config CleanupConfig
	if err := json.Unmarshal(data, &config); err == nil && config.Profiles != nil {
		// New format with profiles
		if profileName == "" {
			profileName = config.DefaultProfile
		}

		if selectedProfile, exists := config.Profiles[profileName]; exists {
			fmt.Printf("📋 Using profile: %s\n", profileName)
			return selectedProfile, nil
		}
		return profile, fmt.Errorf("profile '%s' not found", profileName)
	}

	return profile, fmt.Errorf("failed to parse config JSON or profiles not found: %w", err)
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
		DefaultProfile: "safe",
		Profiles: map[string]CleanupProfile{
			"full": {
				DataDirectories: []string{
					"data",
					"test-data",
					"e2e-data",
					"tmp/schist-*",
					"backend/cmd/schist/test-data-*",
				},
				TestDirectories: []string{
					"e2e/test-results",
					"e2e/playwright-report",
					"frontend/coverage",
					"backend/coverage",
					"backend/test-results",
				},
				E2EResults: []string{
					"e2e/test-results/**",
					"e2e/playwright-report/**",
					"**/playwright-report/**",
					"**/test-results/**",
				},
				LogFiles: []string{
					"*.log",
					"logs/**",
					"backend/*.log",
					"frontend/*.log",
				},
				TempFiles: []string{
					"*.tmp",
					"*.temp",
					".tmp/**",
					"tmp/**",
					"/tmp/schist-*",
					"/var/tmp/schist-*",
					"e2e/playwright/.auth/user.json",
				},
				SearchPatterns: []string{
					"**/node_modules/.cache/**",
					"**/.svelte-kit/output/**",
					"**/dist/**",
					"**/build/**",
				},
				SystemCleanup: true,
			},
			"safe": {
				DataDirectories: []string{
					"data",
					"test-data",
					"e2e-data",
					"backend/cmd/schist/test-data-*",
				},
				TestDirectories: []string{
					"e2e/test-results",
					"e2e/playwright-report",
					"frontend/coverage",
					"backend/coverage",
				},
				E2EResults: []string{
					"e2e/test-results/**",
					"e2e/playwright-report/**",
				},
				LogFiles: []string{
					"*.log",
					"logs/**",
				},
				TempFiles: []string{
					"*.tmp",
					"*.temp",
					"e2e/playwright/.auth/user.json",
				},
				SearchPatterns: []string{},
				SystemCleanup:  false,
			},
			"e2e-only": {
				DataDirectories: []string{
					"backend/cmd/schist/test-data-auth-disabled",
					"backend/cmd/schist/test-data-auth-enabled",
					"backend/cmd/schist/test-data-worker-1",
					"backend/cmd/schist/test-data-worker-2",
					"backend/cmd/schist/test-data-worker-3",
					"backend/cmd/schist/test-data-worker-4",
				},
				TestDirectories: []string{
					"e2e/test-results",
					"e2e/playwright-report",
				},
				E2EResults: []string{
					"e2e/test-results/**",
					"e2e/playwright-report/**",
				},
				LogFiles: []string{},
				TempFiles: []string{
					"e2e/playwright/.auth/user.json",
				},
				SearchPatterns: []string{},
				SystemCleanup:  false,
			},
		},
	}
}

func autoDiscoverTargets(rootDir string) CleanupProfile {
	profile := CleanupProfile{
		DataDirectories: []string{},
		TestDirectories: []string{},
		E2EResults:      []string{},
		LogFiles:        []string{},
		TempFiles:       []string{},
		SearchPatterns:  []string{},
		SystemCleanup:   false,
	}

	// Walk the directory tree to find cleanup targets
	_ = filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if !info.IsDir() {
			return nil
		}

		name := info.Name()

		// Data directories
		if name == "data" || name == "test-data" || name == "e2e-data" || strings.HasPrefix(name, "schist-data") {
			profile.DataDirectories = append(profile.DataDirectories, path)
		}

		// Test result directories
		if name == "test-results" || name == "playwright-report" || name == "coverage" {
			profile.TestDirectories = append(profile.TestDirectories, path)
		}

		return nil
	})

	// Add common patterns
	profile.E2EResults = []string{
		"**/test-results/**",
		"**/playwright-report/**",
	}

	profile.LogFiles = []string{
		"*.log",
		"**/logs/**",
	}

	profile.TempFiles = []string{
		"*.tmp",
		"*.temp",
		"tmp/**",
	}

	return profile
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
	_ = filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
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
	_ = filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
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

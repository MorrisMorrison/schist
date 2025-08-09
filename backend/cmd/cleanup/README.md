# Schist Data Cleanup Tool

A comprehensive cleanup utility for removing Schist data directories, test results, logs, and temporary files.

## Features

- 🧹 **Configuration-based cleanup**: Define cleanup targets in JSON
- 🔍 **Auto-discovery mode**: Automatically find cleanup targets by searching
- 🔍 **Dry-run mode**: Preview what would be deleted without actually deleting
- 📊 **Detailed reporting**: Shows files, directories, and space freed
- 🛡️ **Safety features**: Comprehensive error handling and validation
- ⚡ **Glob patterns**: Support for wildcard patterns and recursive cleanup

## Quick Start

### Using the Shell Script (Recommended)

```bash
# Preview what would be cleaned
make cleanup-dry-run

# Actually perform cleanup
make cleanup

# Auto-discover and preview
./scripts/cleanup.sh --search --dry-run

# Custom config with verbose output
./scripts/cleanup.sh --config my-cleanup.json --verbose
```

### Using the Go Binary Directly

```bash
# Build the tool
cd backend/cmd/cleanup
go build -o cleanup main.go

# Run with default config
./cleanup --dry-run --verbose

# Auto-discovery mode
./cleanup --search --dry-run --root=/path/to/project

# Custom configuration
./cleanup --config=/path/to/config.json
```

## Configuration

The cleanup tool uses a JSON configuration file to define what to clean:

```json
{
  "data_directories": [
    "data",
    "test-data", 
    "e2e-data",
    "tmp/schist-*"
  ],
  "test_directories": [
    "frontend/test-results",
    "frontend/playwright-report", 
    "backend/coverage"
  ],
  "e2e_results": [
    "**/test-results/**",
    "**/playwright-report/**"
  ],
  "log_files": [
    "*.log",
    "logs/**"
  ],
  "temp_files": [
    "*.tmp",
    "tmp/**"
  ],
  "search_patterns": [
    "**/.svelte-kit/output/**",
    "**/node_modules/.cache/**"
  ]
}
```

### Configuration Sections

- **`data_directories`**: Schist data directories (production and test)
- **`test_directories`**: Test result and coverage directories  
- **`e2e_results`**: End-to-end test results and reports
- **`log_files`**: Application log files
- **`temp_files`**: Temporary files and directories
- **`search_patterns`**: Additional patterns for build artifacts

## Command Line Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be deleted without actually deleting |
| `--verbose` | Show detailed output with file counts and sizes |
| `--search` | Auto-discover cleanup targets by searching filesystem |
| `--config` | Specify custom configuration file path |
| `--root` | Set root directory for search mode (default: current directory) |

## Usage Examples

### Development Cleanup
```bash
# Clean development artifacts, keeping actual data
./scripts/cleanup.sh --config dev-cleanup.json --verbose
```

### Full System Reset  
```bash
# Clean everything including data (be careful!)
./scripts/cleanup.sh --verbose
```

### Test Environment Cleanup
```bash
# Clean only test-related files
./scripts/cleanup.sh --config test-cleanup.json --dry-run
```

### Safe Exploration
```bash
# See what would be cleaned without touching anything
./scripts/cleanup.sh --search --dry-run --verbose
```

## Safety Features

- **Dry-run by default in scripts**: Shell script defaults to showing what would be deleted
- **Detailed reporting**: Shows exactly what files and how much space
- **Error handling**: Reports errors without stopping the entire cleanup
- **Path validation**: Validates paths before attempting deletion
- **Glob pattern support**: Safely handles wildcard patterns

## Integration

### Makefile Integration
The tool integrates with the project Makefile:

```bash
make cleanup          # Perform cleanup
make cleanup-dry-run  # Preview cleanup
```

### CI/CD Integration
Add to your CI pipeline for cleaning build artifacts:

```yaml
- name: Cleanup build artifacts
  run: ./scripts/cleanup.sh --config ci-cleanup.json
```

## Advanced Usage

### Custom Configuration Files
Create specialized configurations for different scenarios:

```bash
# Development environment
./scripts/cleanup.sh --config configs/dev-cleanup.json

# CI/CD pipeline  
./scripts/cleanup.sh --config configs/ci-cleanup.json

# Full reset
./scripts/cleanup.sh --config configs/full-cleanup.json
```

### Automation
Schedule regular cleanup:

```bash
# Crontab entry for weekly cleanup
0 2 * * 0 cd /path/to/schist && ./scripts/cleanup.sh --config weekly-cleanup.json
```

## Troubleshooting

### Permission Errors
- Ensure you have write permissions to target directories
- Use `sudo` if cleaning system-wide temporary files

### Configuration Issues
- Validate JSON syntax with `json_pp < config.json`
- Use `--verbose` to see detailed configuration loading

### Path Issues
- Use absolute paths for reliability
- Check that glob patterns are properly escaped

## Contributing

The cleanup tool is designed to be easily extensible:

1. **Add new cleanup categories** in the configuration structure
2. **Implement new search patterns** in the auto-discovery logic  
3. **Add new command-line options** for specialized use cases

See `backend/cmd/cleanup/main.go` for implementation details.
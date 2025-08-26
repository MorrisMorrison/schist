# Schist Cleanup Tool

The Schist Cleanup Tool is a unified data cleanup utility that helps maintain a clean development environment by removing test data, build artifacts, logs, and temporary files.

## Features

- **Profile-based cleanup**: Choose from predefined cleanup profiles for different use cases
- **Dry-run mode**: Preview what would be deleted before actually deleting
- **Glob pattern support**: Clean up files and directories using wildcard patterns
- **Auto-discovery**: Automatically find cleanup targets by scanning the project
- **Detailed reporting**: Get statistics on files and space freed
- **Safe defaults**: Default to safe cleanup mode to prevent accidental data loss

## Usage

### Command Line Interface

```bash
# Build the tool (if not already built)
go build -o cleanup main.go

# Basic usage with default profile (safe)
./cleanup

# Use specific profile
./cleanup --profile=full

# Preview cleanup with dry-run
./cleanup --profile=full --dry-run --verbose

# Auto-discover cleanup targets
./cleanup --search --dry-run
```

### Shell Script Wrapper

The recommended way to use the cleanup tool is through the shell script wrapper:

```bash
# From project root
./scripts/cleanup.sh --profile=safe --dry-run
./scripts/cleanup.sh --profile=full --verbose
./scripts/cleanup.sh --profile=e2e-only
```

### Make Targets

```bash
make cleanup              # Safe cleanup
make cleanup-dry-run      # Preview safe cleanup  
make cleanup-full         # Full system cleanup
make cleanup-e2e          # E2E test cleanup only
```

### NPM Scripts (Frontend)

```bash
npm run cleanup-test-data  # Clean E2E test data
npm run cleanup-e2e        # Clean E2E test data
```

## Cleanup Profiles

### `safe` (Default)
- **Use case**: Regular development cleanup
- **Includes**: Test results, coverage reports, basic temp files
- **Excludes**: System temp directories, build caches
- **System cleanup**: Disabled

**What gets cleaned:**
- `data/`, `test-data/`, `e2e-data/`
- `backend/cmd/schist/test-data-*`
- `e2e/test-results`, `e2e/playwright-report`
- `frontend/coverage`, `backend/coverage`
- Log files (`*.log`, `logs/**`)
- Basic temp files (`*.tmp`, `*.temp`)
- Playwright auth files

### `full`
- **Use case**: Complete system cleanup before releases
- **Includes**: Everything from safe + system temp files + build caches
- **System cleanup**: Enabled

**Additional cleanup:**
- System temp files (`/tmp/schist-*`, `/var/tmp/schist-*`)
- Node modules cache (`**/node_modules/.cache/**`)
- Build outputs (`**/dist/**`, `**/build/**`)
- SvelteKit output (`**/.svelte-kit/output/**`)

### `e2e-only`
- **Use case**: E2E test cleanup, CI/CD pipelines
- **Includes**: Only E2E test data and results
- **System cleanup**: Disabled

**What gets cleaned:**
- E2E test databases (`test-data-auth-disabled`, `test-data-auth-enabled`)
- Worker test data (`test-data-worker-1` through `test-data-worker-4`)
- Test results and reports
- Playwright auth files

## Command Line Options

```
-config string
    Path to cleanup configuration file (default "cleanup-config.json")
-profile string
    Cleanup profile to use (full|safe|e2e-only)
-dry-run
    Show what would be deleted without actually deleting
-verbose
    Show detailed output
-search
    Auto-discover cleanup targets by searching
-root string
    Root directory to search from (default ".")
```

## Configuration File

The tool uses a JSON configuration file with profile-based settings:

```json
{
  "default_profile": "safe",
  "profiles": {
    "safe": {
      "data_directories": ["data", "test-data"],
      "test_directories": ["frontend/test-results"],
      "system_cleanup": false
    },
    "full": {
      "data_directories": ["data", "test-data", "tmp/schist-*"],
      "system_cleanup": true
    }
  }
}
```

### Profile Structure

Each profile supports these categories:

- **`data_directories`**: Data and database directories
- **`test_directories`**: Test result and coverage directories
- **`e2e_results`**: E2E test output patterns (supports globs)
- **`log_files`**: Log file patterns
- **`temp_files`**: Temporary file patterns
- **`search_patterns`**: Advanced cleanup patterns (build caches, etc.)
- **`system_cleanup`**: Boolean flag to enable/disable system temp cleanup

## Integration

### Playwright E2E Tests

The tool is automatically integrated with Playwright tests via `global-teardown.ts`:

```typescript
// Automatically runs after E2E tests complete
await execAsync(`"${cleanupScript}" --profile=e2e-only`);
```

### CI/CD Integration

```bash
# Safe cleanup for regular CI runs
./scripts/cleanup.sh --profile=safe

# Full cleanup for release pipelines
./scripts/cleanup.sh --profile=full --verbose

# E2E-only cleanup after test runs
./scripts/cleanup.sh --profile=e2e-only
```

## Safety Features

1. **Dry-run mode**: Always preview changes first
2. **Safe defaults**: Default profile excludes system directories
3. **Glob validation**: Validates glob patterns before execution  
4. **Error handling**: Continues cleanup even if individual items fail
5. **Detailed logging**: Shows exactly what was cleaned and any errors

## Examples

```bash
# Preview what the safe profile would clean
./scripts/cleanup.sh --profile=safe --dry-run --verbose

# Clean only E2E test data
./scripts/cleanup.sh --profile=e2e-only

# Full cleanup with detailed output
./scripts/cleanup.sh --profile=full --verbose

# Auto-discover cleanup targets in current directory
./scripts/cleanup.sh --search --dry-run

# Use custom config file
./scripts/cleanup.sh --config=my-cleanup-config.json --profile=custom
```

## Building

```bash
# Build the cleanup tool
cd backend/cmd/cleanup
go build -o cleanup main.go

# The shell script will automatically build if needed
./scripts/cleanup.sh --help
```

## Troubleshooting

### Common Issues

**"Profile not found"**
- Check that the profile name is correct: `safe`, `full`, or `e2e-only`
- Verify the configuration file exists and is valid JSON

**"Permission denied"**
- Ensure the cleanup script has execute permissions: `chmod +x scripts/cleanup.sh`
- Some system temp directories may require elevated permissions

**"No files to clean"**
- This is normal if your environment is already clean
- Use `--verbose` flag to see what directories were checked

### Debug Mode

Use the `--verbose` flag to see detailed information about what the tool is doing:

```bash
./scripts/cleanup.sh --profile=safe --dry-run --verbose
```

This will show:
- Active profile configuration
- Each directory/pattern being checked
- Files that would be deleted (in dry-run mode)
- Detailed statistics and any errors
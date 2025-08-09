#!/bin/bash

# Schist Data Cleanup Script
# Usage: ./scripts/cleanup.sh [options]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🧹 Schist Data Cleanup"
echo "======================"

# Check if cleanup tool exists
CLEANUP_TOOL="$PROJECT_ROOT/backend/cmd/cleanup/cleanup"

if [ ! -f "$CLEANUP_TOOL" ]; then
    echo "🔨 Building cleanup tool..."
    cd "$PROJECT_ROOT/backend/cmd/cleanup"
    go build -o cleanup main.go
    echo "✅ Cleanup tool built successfully"
fi

# Default arguments
DRY_RUN=""
VERBOSE=""
SEARCH_MODE=""
CONFIG="$PROJECT_ROOT/cleanup-config.json"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        -v|--verbose)
            VERBOSE="--verbose"
            shift
            ;;
        -s|--search)
            SEARCH_MODE="--search"
            shift
            ;;
        -c|--config)
            CONFIG="$2"
            shift 2
            ;;
        -h|--help)
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  -d, --dry-run     Show what would be deleted without actually deleting"
            echo "  -v, --verbose     Show detailed output"
            echo "  -s, --search      Auto-discover cleanup targets by searching"
            echo "  -c, --config      Specify custom config file (default: cleanup-config.json)"
            echo "  -h, --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 --dry-run                    # Preview what would be cleaned"
            echo "  $0 --verbose                    # Clean with detailed output"
            echo "  $0 --search --dry-run          # Auto-discover and preview"
            echo "  $0 --config custom-config.json # Use custom config"
            echo ""
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Change to project root
cd "$PROJECT_ROOT"

# Run the cleanup tool
echo "🚀 Running cleanup tool..."
echo ""

if [ -n "$SEARCH_MODE" ]; then
    "$CLEANUP_TOOL" $DRY_RUN $VERBOSE --search --root="$PROJECT_ROOT"
else
    "$CLEANUP_TOOL" $DRY_RUN $VERBOSE --config="$CONFIG"
fi

echo ""
echo "🎉 Cleanup operation completed!"

# Suggest next steps if it was a dry run
if [ -n "$DRY_RUN" ]; then
    echo ""
    echo "💡 To actually perform the cleanup, run:"
    echo "   $0 $(echo "$VERBOSE $SEARCH_MODE --config=$CONFIG" | xargs)"
fi
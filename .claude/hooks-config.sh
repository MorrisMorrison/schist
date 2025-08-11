#!/usr/bin/env bash
# Claude hooks configuration for schist project

# Enable hooks for this project
export CLAUDE_HOOKS_ENABLED=true

# Enable debug output for troubleshooting (set to 1 to enable)
# export CLAUDE_HOOKS_DEBUG=1

# Stop on first issue (fail fast mode)
export CLAUDE_HOOKS_FAIL_FAST=false

# Language-specific configurations
export CLAUDE_HOOKS_GO_ENABLED=true
export CLAUDE_HOOKS_JS_ENABLED=true
export CLAUDE_HOOKS_PYTHON_ENABLED=false  # No Python in this project
export CLAUDE_HOOKS_RUST_ENABLED=false    # No Rust in this project

# Go-specific settings aligned with your CLAUDE.md rules
export CLAUDE_HOOKS_GO_FORBIDDEN_PATTERNS=true
export CLAUDE_HOOKS_GO_COMPLEXITY_THRESHOLD=10
export CLAUDE_HOOKS_GO_CYCLO_THRESHOLD=10

# JavaScript/TypeScript settings
export CLAUDE_HOOKS_JS_PRETTIER=true
export CLAUDE_HOOKS_JS_ESLINT=true

# Performance tuning for large codebase
export CLAUDE_HOOKS_MAX_FILES=1000

# Project-specific patterns to check
export CLAUDE_HOOKS_CUSTOM_PATTERNS=true
#!/usr/bin/env bash

set -euo pipefail

if command -v gitleaks >/dev/null 2>&1; then
	gitleaks detect --redact --verbose
	exit 0
fi

if command -v docker >/dev/null 2>&1; then
	docker run --rm \
		-v "${PWD}:/repo" \
		-w /repo \
		zricethezav/gitleaks:latest \
		detect --redact --verbose
	exit 0
fi

echo "gitleaks is not installed and docker is not available." >&2
echo "Install gitleaks (preferred) or install docker, then rerun: make secret-scan" >&2
exit 1

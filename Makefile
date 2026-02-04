.PHONY: all install install-e2e build build-frontend build-backend test test-backend test-frontend run run-backend run-frontend run-docker run-backend-test fmt fmt-backend fmt-frontend fmt-e2e lint lint-frontend lint-backend lint-e2e e2e e2e-ui e2e-test e2e-grep check verify secret-scan cleanup cleanup-dry-run cleanup-full cleanup-full-dry-run cleanup-e2e

all: build

install:
	cd frontend && npm i
	cd backend/cmd/schist && go mod download

install-e2e:
	cd e2e && npm ci

build: install
	make build-frontend
	make build-backend

build-frontend:
	cd frontend && npm run build

build-backend:
	cd backend/cmd/schist && go build

test: install
	make test-backend
	make test-frontend

test-backend:
	cd backend && go test ./...

test-frontend:
	cd frontend && npm run test:unit

run-backend-test:
	cd backend && go test ./...

run-docker:
	docker-compose --profile prod up --build

run-backend:
	cd backend/cmd/schist && go run main.go

run-frontend:
	cd frontend && npm run dev

fmt:
	make fmt-backend
	make fmt-frontend
	make fmt-e2e

fmt-backend:
	cd backend && go fmt ./...

fmt-frontend:
	cd frontend && npm run format

fmt-e2e: install-e2e
	cd e2e && npm run format

lint: 
	make lint-backend
	make lint-frontend
	make lint-e2e

lint-frontend:
	cd frontend && npm run lint

lint-backend:
	cd backend && golangci-lint run

lint-e2e: install-e2e
	cd e2e && npm run lint

e2e: install-e2e
	@echo "Running E2E tests..."
	cd e2e && npm run test

e2e-ui: install-e2e
	cd e2e && npm run test:ui

# Run individual e2e test file
# Usage: make e2e-test TEST=01-document-lifecycle.test.ts
e2e-test: install-e2e
ifndef TEST
	@echo "Usage: make e2e-test TEST=<test-file>"
	@echo "Example: make e2e-test TEST=01-document-lifecycle.test.ts"
	@echo "Example: make e2e-test TEST=authentication.test.ts"
	@echo ""
	@echo "Available test files:"
	@cd e2e && find tests -name "*.test.ts" -exec basename {} \; | sort
	@exit 1
endif
	cd e2e && npx playwright test tests/$(TEST)

# Run specific test by grep pattern (across all test files)
# Usage: make e2e-grep GREP="should delete a document"
e2e-grep: install-e2e
ifndef GREP
	@echo "Usage: make e2e-grep GREP=<test-pattern>"
	@echo "Example: make e2e-grep GREP=\"should delete a document\""
	@echo "Example: make e2e-grep GREP=\"authentication\""
	@exit 1
endif
	cd e2e && npx playwright test --grep "$(GREP)"

check:
	cd frontend && npm run check
	
verify:
	make fmt
	make lint
	make check

secret-scan:
	./scripts/secret-scan.sh

# Data cleanup commands
cleanup:
	./scripts/cleanup.sh --profile=safe

cleanup-dry-run:
	./scripts/cleanup.sh --profile=safe --dry-run --verbose

cleanup-full:
	./scripts/cleanup.sh --profile=full

cleanup-full-dry-run:
	./scripts/cleanup.sh --profile=full --dry-run --verbose

cleanup-e2e:
	./scripts/cleanup.sh --profile=e2e-only
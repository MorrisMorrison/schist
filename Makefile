.PHONY: all install build build-frontend build-backend test test-backend test-frontend run run-backend run-frontend run-docker run-backend-test fmt fmt-backend fmt-frontend lint lint-frontend lint-backend e2e e2e-local e2e-ci e2e-ui e2e-test e2e-grep check verify cleanup cleanup-dry-run cleanup-full cleanup-full-dry-run cleanup-e2e

all: build

install:
	cd frontend && npm i
	cd backend/cmd/schist && go mod download

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

fmt-backend:
	cd backend && go fmt ./...

fmt-frontend:
	cd frontend && npm run format

lint: 
	make lint-backend
	make lint-frontend

lint-frontend:
	cd frontend && npm run lint

lint-backend:
	cd backend && golangci-lint run

e2e: install
	cd frontend && npm run test:e2e

e2e-local: install
	@echo "Running E2E tests locally with Docker Compose..."
	cd frontend && npm run test:e2e

e2e-ci:
	@echo "Running E2E tests in CI with local Docker build..."
	mkdir -p test-data-auth-disabled test-data-auth-enabled
	docker-compose -f docker-compose.e2e-ci.yml up --build -d
	@echo "Waiting for services to be healthy..."
	@timeout 120 bash -c 'while ! docker-compose -f docker-compose.e2e-ci.yml ps --filter "health=healthy" | grep schist-e2e-auth-disabled > /dev/null; do echo "Waiting for auth-disabled service to be healthy..."; sleep 3; done'
	@timeout 120 bash -c 'while ! docker-compose -f docker-compose.e2e-ci.yml ps --filter "health=healthy" | grep schist-e2e-auth-enabled > /dev/null; do echo "Waiting for auth-enabled service to be healthy..."; sleep 3; done'
	@echo "✅ Services are healthy! Testing connectivity..."
	@timeout 60 bash -c 'while ! curl -f -s http://localhost:8081/api/health > /dev/null; do echo "Waiting for auth-disabled service on localhost:8081..."; sleep 2; done'
	@timeout 60 bash -c 'while ! curl -f -s http://localhost:8082/api/health > /dev/null; do echo "Waiting for auth-enabled service on localhost:8082..."; sleep 2; done'
	@echo "✅ All services are ready and accessible!"
	cd frontend && npx playwright test
	@echo "Cleaning up..."
	docker-compose -f docker-compose.e2e-ci.yml down --rmi all --volumes --remove-orphans || true
	rm -rf test-data-auth-disabled test-data-auth-enabled || true

e2e-ui:
	cd frontend && npm run test:e2e-ui

# Run individual e2e test file
# Usage: make e2e-test TEST=01-document-lifecycle.test.ts
e2e-test: install
ifndef TEST
	@echo "Usage: make e2e-test TEST=<test-file>"
	@echo "Example: make e2e-test TEST=01-document-lifecycle.test.ts"
	@echo "Example: make e2e-test TEST=authentication.test.ts"
	@echo ""
	@echo "Available test files:"
	@cd frontend && find e2e/tests -name "*.test.ts" -exec basename {} \; | sort
	@exit 1
endif
	cd frontend && npx playwright test e2e/tests/$(TEST) && npm run cleanup-e2e

# Run specific test by grep pattern (across all test files)
# Usage: make e2e-grep GREP="should delete a document"
e2e-grep:
ifndef GREP
	@echo "Usage: make e2e-grep GREP=<test-pattern>"
	@echo "Example: make e2e-grep GREP=\"should delete a document\""
	@echo "Example: make e2e-grep GREP=\"authentication\""
	@exit 1
endif
	cd frontend && npx playwright test --grep "$(GREP)" && npm run cleanup-e2e

check:
	cd frontend && npm run check
	
verify:
	make fmt
	make lint
	make check

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
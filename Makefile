.PHONY: all install build build-frontend build-backend test run run-backend run-frontend run-docker run-docker-dev run-backend-test fmt fmt-backend fmt-frontend lint lint-frontend lint-backend e2e e2e-ui check verify cleanup cleanup-dry-run

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
	cd backend && go test ./...

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

e2e-ui:
	cd frontend && npm run test:e2e-ui

check:
	cd frontend && npm run check
	
verify:
	make fmt
	make lint
	make check

# Data cleanup commands
cleanup:
	./scripts/cleanup.sh

cleanup-dry-run:
	./scripts/cleanup.sh --dry-run --verbose
.PHONY: all install build build-frontend build-backend test run run-backend run-frontend run-docker run-docker-dev run-backend-test fmt fmt-backend fmt-frontend lint e2e e2e-ui

all: build

install:
	cd frontend && npm i
	cd backend/cmd/schist && go mod download

build: install
	cd frontend && npm run build
	cd backend/cmd/schist && go build

build-frontend:
	cd frontend && npm run build

build-backend:
	cd backend/cmd/schist && go build

test: install
	cd frontend && npm test
	cd backend && go test ./...

run-backend-test:
	cd backend && go test ./...

run-docker:
	docker-compose up --build

run-docker-dev:
	docker-compose --profile dev up --build

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
	cd frontend && npm run lint

e2e: install
	cd frontend && npx playwright test

e2e-ui:
	cd frontend && npx playwright test --ui

.PHONY: run, run-backend, run-frontend, run-e2e, run-docker

run-docker:
	docker-compose up --build

run-docker-dev:
	docker-compose --profile dev up --build


run-backend: 
	cd backend/cmd/schist && go run main.go

run-frontend:
	cd frontend && npm run dev

run-e2e:
	cd frontend/e2e && npx playwright test
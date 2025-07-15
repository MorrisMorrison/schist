# Quick Start Guide

## Prerequisites

- [Go 1.21+](https://golang.org/dl/)
- [Node.js 22+](https://nodejs.org/)
- [Docker](https://docker.com/) (optional)

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/MorrisMorrison/schist.git
   cd schist
   ```

2. **Start the backend** (in one terminal)
   ```bash
   NODE_ENV=development make run-backend
   ```

3. **Start the frontend** (in another terminal)
   ```bash
   make run-frontend
   ```

4. **Open your browser**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8080/api/health

## Production Deployment

### Using Docker (Recommended)

```bash
# Build and run
make run-docker

# Or with docker-compose
docker-compose up --build
```

### Manual Build

```bash
# Build frontend
cd frontend && npm install && npm run build

# Build backend
cd backend && go build -o schist ./cmd/schist

# Run
./backend/schist
```

Your wiki will be available at http://localhost:8080

## Available Commands

```bash
# Development
make run-backend           # Start Go backend server
make run-frontend          # Start Svelte dev server
make run-e2e              # Run end-to-end tests

# Production
make run-docker           # Build and run with Docker
make run-docker-dev       # Development with Docker
```

## Next Steps

- Check out the [API Documentation](API.md) for endpoint details
- See [Configuration](CONFIGURATION.md) for environment variables
- Read the [Development Guide](DEVELOPMENT.md) for contributing
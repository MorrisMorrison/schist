# Development Guide

Contributing to Schist is easy! This guide covers the development workflow, architecture, testing, and contribution guidelines.

## Development Setup

### Prerequisites

- **Go 1.21+** - Backend development
- **Node.js 18+** - Frontend development
- **Git** - Version control

### Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/MorrisMorrison/schist.git
cd schist
cd frontend && npm install && cd ..

# 2. Start development (two terminals)
ENV=development make run-backend    # Terminal 1
make run-frontend                        # Terminal 2

# 3. Access at http://localhost:5173
```

### Backend Development

**Environment Setup:**
```bash
# Navigate to backend
cd backend

# Download dependencies
go mod download

# Run with auto-restart
ENV=development make run-backend

# Or run directly from backend directory
cd cmd/schist && go run main.go
```

**Key Backend Features:**
- **Gin HTTP Framework** - Fast, minimal web framework
- **File-based Storage** - No database required
- **YAML Front Matter** - Markdown with metadata
- **Asset Management** - Image upload and serving
- **Hierarchical Documents** - Folder-based organization
- **CORS Support** - Development-mode CORS for frontend
- **Rate Limiting** - IP-based request limiting with configurable thresholds
- **Basic Authentication** - Optional authentication for all endpoints
- **Security Middleware** - Modular middleware for authentication and rate limiting

### Frontend Development

**Environment Setup:**
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Run development server
npm run-dev

# Build for production
npm run build
```

**Key Frontend Features:**
- **SvelteKit** - Full-stack Svelte framework
- **Tailwind CSS v4** - Utility-first styling
- **TypeScript** - Type safety throughout
- **Vite** - Fast build tool and dev server
- **Playwright** - E2E testing framework

## Code Standards

### Go Code Style

- **Standard Formatting**: Use `gofmt` and follow Go conventions
- **Error Handling**: Always handle errors explicitly
- **Naming**: Use descriptive names (`userID` not `id`)
- **Package Structure**: Keep internal packages focused
- **Testing**: Write table-driven tests for complex logic

### Svelte Code Style

- **TypeScript First**: Use TypeScript for all components
- **Component Composition**: Keep components small and focused
- **State Management**: Use Svelte stores for shared state
- **Naming Conventions**: PascalCase for components, camelCase for variables
- **Accessibility**: Include ARIA labels and semantic HTML

## Testing Strategy

### Backend Testing

**Unit Tests:**
```bash
# Run all backend tests
make run-backend-test

# Run specific package tests
cd backend && go test ./services -v

# Run with coverage
cd backend && go test -cover ./...
```

### Frontend Testing

**Component Tests:**
```bash
# Run unit tests
cd frontend && npm test

# Run with coverage
cd frontend && npm run test:coverage
```

**E2E Tests:**
```bash
# Run end-to-end tests
make e2e

# Run specific test
cd e2e && npx playwright test document-creation
```

**API Testing:**
Use HTTP files in `/http` directory with VS Code REST Client:
1. Install REST Client extension
2. Open any `.http` file
3. Click "Send Request" on any endpoint

## Code Quality Tools

### Formatting and Linting

```bash
# Format both frontend and backend
make fmt

# Format backend only
make fmt-backend

# Format frontend only
make fmt-frontend

# Lint frontend code
make lint

# Format and Lint all
make verify
```

### Pre-commit Workflow

Before committing changes:
```bash
# 1. Verify changes
make verify

# 3. Run tests
make test

# 4. Run e2e tests (optional but recommended)
make run-e2e

# 5. Commit changes
git add .
git commit -m "feat: add new feature"
```

## Architecture Overview

### Backend Architecture

**Request Flow:**
```
HTTP Request → Gin Router → Middleware → Handler → Service → File System
                              ↓
                    [Rate Limiting] → [Authentication]
```

**Key Components:**
- **Handlers** (`internal/handlers/`) - HTTP request/response logic
- **Middleware** (`internal/middleware/`) - Security and request processing
- **Services** (`internal/services/`) - Business logic and file operations
- **Models** (`internal/models/`) - Data structures
- **Serializer** (`internal/serializer/`) - Markdown + YAML front matter serialization
- **Config** (`internal/config/`) - Environment-based configuration

**Middleware Layer:**
- `RateLimitMiddleware` - IP-based request rate limiting
- `BasicAuthMiddleware` - HTTP basic authentication

**Service Layer:**
- `DocumentService` - CRUD operations for documents
- `FolderService` - Folder management and hierarchy
- `AssetService` - File upload and serving

### Frontend Architecture

**Component Hierarchy:**
```
App → Layout → Page Components → UI Components
```

**Key Features:**
- **SPA Mode** - Single-page application with client-side routing
- **Dynamic Routes** - `[...path]` for hierarchical page URLs
- **Component Library** - Reusable UI components
- **Store Management** - Svelte stores for global state
- **API Integration** - Fetch-based API communication

### Data Flow

**Document Creation Flow:**
1. User creates document in frontend editor
2. Frontend sends POST to `/api/documents`
3. Backend validates and parses metadata
4. Document saved as markdown file with YAML front matter
5. Frontend updates UI with new document

**Asset Upload Flow:**
1. User uploads image in editor
2. Frontend sends multipart form to `/api/assets/upload`
3. Backend validates file type and size
4. File saved with unique hash-based name
5. Frontend inserts markdown image syntax

## Contributing Workflow

### 1. Setup Development Environment

```bash
git clone https://github.com/MorrisMorrison/schist.git
cd schist
cd frontend && npm install && cd ..
```

### 2. Create Feature Branch

```bash
git checkout -b feature/amazing-feature
```

### 3. Make Your Changes

- **Add Tests** - Write tests for new functionality
- **Update Docs** - Update relevant documentation
- **Follow Standards** - Use existing code patterns

### 4. Test Your Changes

```bash
# Start development servers
ENV=development make run-backend    # Terminal 1
make run-frontend                        # Terminal 2

# Run tests
make test
make run-e2e

# Code quality
make verify 
```

### 5. Submit Pull Request

```bash
git add .
git commit -m "feat: add amazing feature"
git push origin feature/amazing-feature
```

**Pull Request Checklist:**
- [ ] Tests pass
- [ ] Code is formatted (`make fmt`)
- [ ] Frontend is linted (`make lint`)
- [ ] Documentation updated
- [ ] Feature works in both development and production modes

## Debugging

### Backend Debugging

**Development Logging:**
```bash
# Enable debug mode
ENV=development make run-backend

# Logs include file:line information
# CORS requests are logged
# Gin debug mode shows all routes
# Security middleware status is logged
```

**Security Development:**
```bash
# Test with security features enabled
SCHIST_RATE_LIMIT_ENABLED=true \
SCHIST_RATE_LIMIT_RPM=5 \
ENV=development make run-backend

# Development logs will show:
# "Rate limiting enabled: 5 requests per minute"
```

**Using Delve Debugger:**
```bash
# Install delve
go install github.com/go-delve/delve/cmd/dlv@latest

# Debug main application
cd backend && dlv debug ./cmd/schist

# Set breakpoints and step through code
```

## Deployment

### Development Deployment

```bash
# Two-server development (recommended)
ENV=development make run-backend    # :8080
make run-frontend                        # :5173
```

### Production Deployment

```bash
# Docker production (recommended)
make run-docker

# Manual production build
cd frontend && npm run build
cd ../backend && go build -o schist ./cmd/schist
SCHIST_STATIC_DIR=../frontend/build ./schist
```
## Getting Help

### Resources

- **Codebase Questions** - Check existing tests for usage examples
- **API Questions** - Use HTTP files to test endpoints
- **Frontend Questions** - Check component tests and Svelte docs
- **Build Issues** - Verify make commands and prerequisites

### Debugging Steps

1. **Check Logs** - Backend terminal output for errors
2. **Test API** - Use `/api/health` to verify backend
3. **Check Network** - Browser dev tools for API calls
4. **Verify Environment** - Correct ENV and ports
5. **Clean Build** - `make run-docker` for fresh environment

Happy coding! 🚀
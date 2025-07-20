# Development Guide

Contributing to Schist is easy! This guide covers the development workflow, architecture, testing, and contribution guidelines.

## Project Structure

```
schist/
├── backend/                    # Go backend
│   ├── cmd/schist/            # Main application entry point
│   │   └── main.go
│   ├── internal/              # Internal packages
│   │   ├── config/           # Configuration management
│   │   ├── handlers/         # HTTP route handlers
│   │   ├── models/           # Data models and structures
│   │   ├── parser/           # Markdown parsing with YAML front matter
│   │   ├── serializer/       # Data serialization utilities
│   │   └── services/         # Business logic services
│   │       ├── asset_service.go      # Asset upload/management
│   │       ├── asset_service_test.go # Asset service tests
│   │       ├── folder_service.go     # Folder operations
│   │       ├── page_service.go       # Page CRUD operations
│   │       └── page_service_test.go  # Page service tests
│   ├── utils/                # Utility functions
│   │   ├── utils.go
│   │   └── utils_test.go     # Utility tests
│   ├── go.mod               # Go module definition
│   └── go.sum               # Go dependency checksums
├── frontend/                  # Svelte frontend
│   ├── src/
│   │   ├── lib/             # Reusable components
│   │   │   ├── components/  # UI components
│   │   │   │   ├── Breadcrumbs.svelte
│   │   │   │   ├── Editor.svelte
│   │   │   │   ├── FolderTree.svelte
│   │   │   │   ├── PageList.svelte
│   │   │   │   └── SearchResults.svelte
│   │   │   └── stores/       # Svelte stores for state
│   │   ├── routes/          # SvelteKit routes
│   │   │   ├── +layout.svelte
│   │   │   ├── +page.svelte
│   │   │   └── [...path]/   # Dynamic page routing
│   │   └── app.html         # HTML template
│   ├── e2e/                 # Playwright e2e tests
│   ├── tests/               # Component tests
│   ├── package.json         # Node.js dependencies
│   ├── svelte.config.js     # SvelteKit configuration
│   ├── vite.config.ts       # Vite build configuration
│   ├── tailwind.config.js   # Tailwind CSS v4 configuration
│   └── tsconfig.json        # TypeScript configuration
├── data/                      # Default data directory
│   ├── pages/               # Markdown pages storage
│   └── assets/              # Uploaded assets storage
├── docs/                      # Documentation
│   ├── API.md
│   ├── CONFIGURATION.md
│   ├── DEVELOPMENT.md       # This file
│   └── QUICK_START.md
├── http/                      # HTTP API testing files
├── docker-compose.yml         # Production Docker setup
├── Dockerfile                 # Docker build configuration
└── Makefile                   # Build and development commands
```

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
- **Hierarchical Pages** - Folder-based organization
- **CORS Support** - Development-mode CORS for frontend

### Frontend Development

**Environment Setup:**
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

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

**Example Go Code:**
```go
func (s *PageService) CreatePage(page *models.Page) error {
    if err := s.validatePage(page); err != nil {
        return fmt.Errorf("validation failed: %w", err)
    }
    
    if err := s.savePage(page); err != nil {
        return fmt.Errorf("save failed: %w", err)
    }
    
    return nil
}
```

### Svelte Code Style

- **TypeScript First**: Use TypeScript for all components
- **Component Composition**: Keep components small and focused
- **State Management**: Use Svelte stores for shared state
- **Naming Conventions**: PascalCase for components, camelCase for variables
- **Accessibility**: Include ARIA labels and semantic HTML

**Example Svelte Component:**
```svelte
<script lang="ts">
  import type { Page } from '$lib/types';
  
  export let page: Page;
  export let onSave: (page: Page) => void;
  
  let isEditing = false;
</script>

<article class="page">
  <h1>{page.metaData.title}</h1>
  <!-- Component content -->
</article>
```

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

**Existing Tests:**
- `services/page_service_test.go` - Page CRUD operations
- `services/asset_service_test.go` - Asset management
- `utils/utils_test.go` - Utility functions

**Test Structure:**
```go
func TestPageService_CreatePage(t *testing.T) {
    tests := []struct {
        name    string
        page    *models.Page
        wantErr bool
    }{
        {
            name: "valid page",
            page: &models.Page{
                MetaData: &models.PageMetaData{
                    Title: "Test Page",
                    Path:  "/test",
                },
                Content: "# Test",
            },
            wantErr: false,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Test implementation
        })
    }
}
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
make run-e2e

# Run specific test
cd frontend && npx playwright test page-creation
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
```

### Pre-commit Workflow

Before committing changes:
```bash
# 1. Format code
make fmt

# 2. Lint frontend
make lint

# 3. Run backend tests
make run-backend-test

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
HTTP Request → Gin Router → Handler → Service → File System
```

**Key Components:**
- **Handlers** (`internal/handlers/`) - HTTP request/response logic
- **Services** (`internal/services/`) - Business logic and file operations
- **Models** (`internal/models/`) - Data structures
- **Parser** (`internal/parser/`) - Markdown + YAML front matter parsing
- **Config** (`internal/config/`) - Environment-based configuration

**Service Layer:**
- `PageService` - CRUD operations for pages
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

**Page Creation Flow:**
1. User creates page in frontend editor
2. Frontend sends POST to `/api/pages`
3. Backend validates and parses metadata
4. Page saved as markdown file with YAML front matter
5. Frontend updates UI with new page

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
make run-backend-test
make run-e2e

# Code quality
make fmt && make lint
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
```

**Using Delve Debugger:**
```bash
# Install delve
go install github.com/go-delve/delve/cmd/dlv@latest

# Debug main application
cd backend && dlv debug ./cmd/schist

# Set breakpoints and step through code
```

### Frontend Debugging

**Browser Developer Tools:**
- **Network Tab** - Monitor API calls
- **Console** - JavaScript errors and logs
- **Svelte DevTools** - Component state inspection

**Development Mode:**
```bash
# Vite provides hot reload and source maps
make run-frontend

# Access source maps in browser debugger
```

## Performance Considerations

### Backend Performance

- **File I/O Optimization** - Efficient file reading/writing
- **Concurrent Handling** - Gin handles concurrent requests
- **Memory Management** - Avoid loading large files into memory
- **Path Validation** - Fast regex-based path checking

### Frontend Performance

- **Code Splitting** - SvelteKit automatically splits routes
- **Asset Optimization** - Vite optimizes bundles
- **Lazy Loading** - Components load on demand
- **Efficient Rendering** - Svelte's reactive updates

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

## Common Development Tasks

### Adding a New API Endpoint

1. **Define Model** (if needed) in `internal/models/`
2. **Add Service Method** in appropriate service
3. **Create Handler** in `internal/handlers/`
4. **Register Route** in main.go
5. **Add Tests** for service and handler
6. **Update API Documentation**

### Adding a New Frontend Component

1. **Create Component** in `frontend/src/lib/components/`
2. **Add TypeScript Types** if needed
3. **Write Component Tests**
4. **Update Parent Components** to use new component
5. **Add to Component Library** documentation

### Database Schema Changes

Since Schist is file-based, "schema changes" involve:
1. **Update Models** in `internal/models/`
2. **Update Parser** if YAML front matter changes
3. **Add Migration Logic** if needed for existing files
4. **Update API Documentation** with new field schemas

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
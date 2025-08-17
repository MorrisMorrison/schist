# Contributing to Schist

Welcome to Schist! We're excited you're interested in contributing to our lightweight, self-hosted markdown wiki. This guide will help you get started quickly and contribute effectively.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Contributing Process](#contributing-process)
- [Testing](#testing)
- [Architecture Overview](#architecture-overview)
- [Getting Help](#getting-help)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Go 1.23+** - Backend development ([Download Go](https://golang.org/dl/))
- **Node.js 18+** - Frontend development ([Download Node.js](https://nodejs.org/))
- **Git** - Version control
- **Make** - Build automation (usually pre-installed on Linux/macOS)

### Quick Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/MorrisMorrison/schist.git
   cd schist
   ```

2. **Install dependencies**:
   ```bash
   # Install frontend dependencies
   cd frontend && npm install && cd ..
   
   # Go dependencies are handled automatically
   ```

3. **Start development servers** (requires two terminals):
   ```bash
   # Terminal 1: Backend server (Go)
   ENV=development make run-backend
   
   # Terminal 2: Frontend server (Svelte)
   make run-frontend
   ```

4. **Access the application**:
   - Frontend: http://localhost:5173 (Vite dev server)
   - Backend API: http://localhost:8080 (Go server)

Your development environment is now ready! The frontend automatically proxies API requests to the backend.

## Development Workflow

### Using the Makefile

Schist provides a comprehensive Makefile for common development tasks:

```bash
# Development
make install          # Install all dependencies
make run-backend      # Start Go backend server
make run-frontend     # Start Svelte frontend server

# Building
make build           # Build both frontend and backend
make build-frontend  # Build only frontend
make build-backend   # Build only backend

# Testing
make test           # Run all tests
make test-backend   # Run Go tests
make test-frontend  # Run Vitest unit tests
make e2e            # Run Playwright E2E tests

# Code Quality
make fmt            # Format all code
make lint           # Lint frontend code
make verify         # Format + lint + type check
```

### Development Mode Features

When running in development mode (`ENV=development`):
- **CORS enabled** for frontend requests
- **Detailed logging** with file:line information
- **Auto-restart** on file changes (you may need to set this up)
- **Debug routes** visible in logs

## Code Standards

### Go Backend Standards

Schist follows strict Go coding standards to maintain code quality:

#### ✅ Required Patterns
- **Concrete types**: Always use specific types, never `interface{}` or `any`
- **Meaningful names**: Use `userID` instead of `id`, `docPath` instead of `path`
- **Early returns**: Reduce nesting with guard clauses
- **Simple error handling**: `return fmt.Errorf("context: %w", err)`
- **Table-driven tests**: For complex logic with multiple test cases

#### ❌ Forbidden Patterns
- **NO `interface{}`** or `any{}` - Use concrete types always
- **NO `time.Sleep()`** - Use channels for synchronization
- **NO migration functions** - Delete old code when replacing
- **NO versioned function names** - No `processV2`, `handleNew`, etc.
- **NO custom error hierarchies** - Keep errors simple

#### Project Structure
```
backend/
├── cmd/                 # Application entrypoints
│   └── schist/         # Main application
├── internal/           # Private code (majority of code goes here)
│   ├── config/         # Configuration management
│   ├── handlers/       # HTTP request handlers
│   ├── middleware/     # Authentication, rate limiting
│   ├── models/         # Data structures
│   ├── services/       # Business logic
│   └── utils/          # Utility functions
└── templates/          # Document templates
```

### Frontend Standards (Svelte 5 + TypeScript)

#### Best Practices
- **TypeScript first**: All components use TypeScript
- **Component composition**: Keep components small and focused
- **Svelte 5 syntax**: Use new runes (`$state`, `$effect`, etc.)
- **Tailwind CSS v4**: Use utility-first styling
- **Accessibility**: Include ARIA labels and semantic HTML

#### Naming Conventions
- **Components**: `PascalCase` (e.g., `DocumentEditor.svelte`)
- **Variables**: `camelCase` (e.g., `documentTitle`)
- **Files**: `kebab-case` for utilities (e.g., `keyboard-shortcuts.ts`)
- **Stores**: `camelCase` with descriptive names (e.g., `documentsStore`)

#### Frontend Structure
```
frontend/src/
├── lib/
│   ├── components/     # Reusable UI components
│   ├── stores/         # Svelte stores for state management
│   ├── utils/          # Utility functions
│   └── types/          # TypeScript type definitions
├── routes/            # SvelteKit routes
└── app.html          # HTML template
```

## Contributing Process

### 1. Find or Create an Issue

- Browse [existing issues](https://github.com/MorrisMorrison/schist/issues)
- For bugs: Include steps to reproduce, expected vs actual behavior
- For features: Describe the use case and proposed solution
- For questions: Check documentation first, then ask in discussions

### 2. Fork and Create a Branch

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR-USERNAME/schist.git
cd schist
git checkout -b feature/your-feature-name
```

#### Branch Naming Conventions
- **Features**: `feat/feature-description`
- **Bug fixes**: `fix/bug-description`
- **Documentation**: `docs/what-you-updated`
- **Refactoring**: `refactor/what-you-improved`

### 3. Make Your Changes

#### Before You Code
1. **Read the code** - Understand existing patterns
2. **Write tests first** - For complex features
3. **Follow standards** - Use existing code style
4. **Keep changes focused** - One feature per PR

#### While Coding
1. **Test continuously**:
   ```bash
   make verify    # Check formatting and linting
   make test      # Run unit tests
   ```

2. **Test your feature manually**:
   - Start both servers
   - Test the happy path
   - Test error conditions
   - Verify responsive design

### 4. Quality Checks

Before submitting, ensure all checks pass:

```bash
# Code quality (MUST be green)
make verify

# All tests pass
make test

# E2E tests (for UI changes)
make e2e
```

### 5. Submit Pull Request

#### PR Title Format
- `feat: add document search feature`
- `fix: resolve markdown rendering issue`
- `docs: update installation guide`
- `refactor: simplify authentication logic`

#### PR Description Template
```markdown
## Description
Brief description of what this PR does.

## Changes
- Specific change 1
- Specific change 2

## Testing
- [ ] Unit tests pass
- [ ] E2E tests pass (if applicable)
- [ ] Manual testing completed

## Screenshots (if applicable)
Before/after screenshots for UI changes.
```

### 6. Code Review Process

#### What Reviewers Look For
- **Code quality**: Follows project standards
- **Tests**: Adequate test coverage
- **Documentation**: Updated when needed
- **Breaking changes**: Clearly documented
- **Security**: No vulnerabilities introduced

#### Addressing Feedback
- Respond to all comments
- Make requested changes in new commits
- Test changes after each update
- Be patient and collaborative

## Testing

### Unit Tests

#### Backend Tests (Go)
```bash
# Run all backend tests
make test-backend

# Run specific package tests
cd backend && go test ./services -v

# Run with coverage
cd backend && go test -cover ./...
```

#### Frontend Tests (Vitest)
```bash
# Run all frontend tests
make test-frontend

# Run in watch mode
cd frontend && npm run test:unit -- --watch

# Run specific test file
cd frontend && npm run test:unit -- utils/keyboard-shortcuts.test.ts
```

### End-to-End Tests (Playwright)

E2E tests ensure the entire application works correctly:

```bash
# Run all E2E tests
make e2e

# Run with UI (for debugging)
make e2e-ui

# Run specific test file
make e2e-test TEST=01-document-lifecycle.test.ts

# Run tests matching a pattern
make e2e-grep GREP="should create a document"
```

### API Testing

Use the HTTP files in the `/http` directory:

1. Install the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) VS Code extension
2. Open any `.http` file (e.g., `http/documents.http`)
3. Click "Send Request" above any endpoint
4. View responses inline

## Architecture Overview

### Technology Stack

- **Backend**: Go 1.23+ with Gin web framework
- **Frontend**: Svelte 5 with SvelteKit and TypeScript
- **Styling**: Tailwind CSS v4
- **Testing**: Go testing, Vitest, Playwright
- **Storage**: File-based (no database)
- **Auth**: WebAuthn (Passkeys) with JWT

### Backend Architecture

```
HTTP Request → Gin Router → Middleware → Handler → Service → File System
                              ↓
                    [Rate Limiting] → [Authentication]
```

#### Key Components
- **Handlers**: HTTP request/response logic
- **Services**: Business logic and file operations  
- **Middleware**: Security, rate limiting, CORS
- **Models**: Data structures and validation
- **Config**: Environment-based configuration

### Frontend Architecture

```
App → Layout → Page Components → UI Components
```

#### Key Features
- **SPA routing**: Client-side navigation
- **Component library**: Reusable UI components
- **Store management**: Svelte stores for global state
- **API integration**: Type-safe API client

### Data Flow Example

**Creating a Document**:
1. User types in editor → Frontend validation
2. Frontend sends POST to `/api/documents` → Backend handler
3. Handler validates → Service processes → File written
4. Success response → Frontend updates UI → User sees new document

## Getting Help

### Resources

- **[Documentation](docs/)** - Comprehensive guides
- **[API Reference](docs/API.md)** - Complete API documentation
- **[GitHub Issues](https://github.com/MorrisMorrison/schist/issues)** - Bug reports and feature requests
- **[GitHub Discussions](https://github.com/MorrisMorrison/schist/discussions)** - Questions and community chat

### Debugging Tips

1. **Check the logs**:
   - Backend: Terminal running `make run-backend`
   - Frontend: Browser console and Network tab

2. **Verify API connectivity**:
   ```bash
   curl http://localhost:8080/api/health
   ```

3. **Test with clean state**:
   ```bash
   make cleanup-e2e  # Clean test data
   ```

4. **Use HTTP files**: Test API endpoints directly

### Common Issues

**Backend won't start**:
- Check Go version: `go version`
- Verify port 8080 is free: `lsof -i :8080`

**Frontend build fails**:
- Check Node.js version: `node --version`
- Clear and reinstall: `rm -rf node_modules package-lock.json && npm install`

**Tests failing**:
- Run `make verify` first
- Check if backend is running for E2E tests
- Look at test output for specific errors

## Security Guidelines

- **Validate all inputs** on both frontend and backend
- **Use prepared statements** for any future database integration
- **Never commit secrets** to version control
- **Follow OWASP guidelines** for web security
- **Test authentication flows** thoroughly

## License

By contributing to Schist, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Schist!** 🪨

Your contributions help make Schist better for everyone. If you have questions, don't hesitate to ask in the discussions or create an issue.
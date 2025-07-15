# Development Guide

## Project Structure

```
schist/
├── backend/                 # Go backend
│   ├── cmd/schist/         # Main application
│   ├── internal/           # Internal packages
│   │   ├── config/        # Configuration
│   │   ├── handlers/      # HTTP handlers
│   │   ├── models/        # Data models
│   │   ├── parser/        # Markdown parsing
│   │   └── services/      # Business logic
│   └── go.mod
├── frontend/               # Svelte frontend
│   ├── src/
│   │   ├── lib/           # Reusable components
│   │   ├── routes/        # SvelteKit routes
│   │   └── app.html
│   └── package.json
├── http/                   # API testing files
├── docs/                   # Documentation
├── docker-compose.yml
├── Dockerfile
└── Makefile
```

## Development Setup

### Backend Development

```bash
# Install dependencies
cd backend && go mod download

# Run with hot reload (requires air)
go install github.com/cosmtrek/air@latest
air

# Or run directly
NODE_ENV=development go run ./cmd/schist
```

### Frontend Development

```bash
# Install dependencies
cd frontend && npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

## Code Standards

### Go Code Style

- Follow standard Go formatting (`gofmt`)
- Use descriptive variable names
- Keep functions small and focused
- Handle errors explicitly
- Use interfaces for testability

### Svelte Code Style

- Use TypeScript for type safety
- Follow Svelte naming conventions
- Keep components small and reusable
- Use stores for state management
- Implement proper error handling

## Testing

### API Testing

Use HTTP files in `/http` directory:

```bash
# Install VS Code REST Client extension
# Open .http files and click "Send Request"
```

### Unit Testing (TODO)

```bash
# Go tests
cd backend && go test ./...

# Frontend tests
cd frontend && npm test
```

### End-to-End Testing (TODO)

```bash
# Run E2E tests
make run-e2e
```

## Contributing

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make your changes**
   - Follow code standards
   - Add tests if applicable
   - Update documentation

4. **Test your changes**
   ```bash
   # Test backend
   NODE_ENV=development make run-backend
   
   # Test frontend
   make run-frontend
   
   # Test API endpoints
   # Use HTTP files in /http directory
   ```

5. **Commit and push**
   ```bash
   git commit -m 'Add amazing feature'
   git push origin feature/amazing-feature
   ```

6. **Open a Pull Request**

### Code Review Process

- All changes require pull request review
- Automated tests must pass
- Code must follow style guidelines
- Documentation must be updated

## Architecture Decisions

### Backend Architecture

- **Framework**: Gin for HTTP routing
- **File Storage**: Direct filesystem operations
- **Search**: Bleve for full-text search (planned)
- **Configuration**: Environment variables
- **Logging**: Standard Go logging

### Frontend Architecture

- **Framework**: SvelteKit for SSG/SPA
- **Styling**: Tailwind CSS
- **Editor**: CodeMirror 6
- **Markdown**: Marked.js for rendering
- **Build**: Vite for bundling

### Design Principles

1. **Simplicity First** - Avoid over-engineering
2. **File-Based** - No database dependency
3. **Standards-Compliant** - Use standard markdown
4. **Performance** - Fast load times and search
5. **Self-Hosted** - Easy deployment and maintenance

## Debugging

### Backend Debugging

```bash
# Enable debug logging
NODE_ENV=development go run ./cmd/schist

# Use delve debugger
go install github.com/go-delve/delve/cmd/dlv@latest
dlv debug ./cmd/schist
```

### Frontend Debugging

```bash
# Svelte dev tools
npm run dev

# Browser developer tools
# Network tab for API calls
# Console for JavaScript errors
```

## Performance Considerations

### Backend Performance

- File watching for auto-indexing
- Efficient search indexing
- Concurrent request handling
- Memory usage optimization

### Frontend Performance

- Code splitting with SvelteKit
- Lazy loading of components
- Efficient markdown rendering
- Optimized bundle sizes

## Deployment

### Local Development

```bash
# Terminal 1: Backend
NODE_ENV=development make run-backend

# Terminal 2: Frontend
make run-frontend
```

### Production Build

```bash
# Docker deployment
make run-docker

# Manual deployment
cd frontend && npm run build
cd backend && go build -o schist ./cmd/schist
./backend/schist
```
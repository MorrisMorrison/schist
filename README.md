# Schist 🪨

> **"Obsidian is volcanic glass—beautiful but complex. Schist is simple rock that splits into perfect layers, just like your knowledge base should."**

Schist is a lightweight, self-hosted markdown wiki that brings Obsidian-like functionality to the web browser. Named after the rock that naturally splits into thin layers (just like markdown files), Schist focuses on simplicity, speed, and ease of use while maintaining the power of interconnected knowledge management.

## Features

- 📝 **Markdown-first** - Write in plain markdown with live preview
- 🔗 **Wiki linking** - Connect pages with `[[Page Name]]` syntax
- 🔍 **Full-text search** - Find content across all your pages
- 📁 **File-based storage** - No database required, just markdown files
- 🌐 **Web-based** - Access your wiki from any browser
- 🎨 **Clean interface** - Responsive design with dark/light themes
- 🐳 **Docker ready** - Easy deployment with Docker
- ⚡ **Fast** - Built with Go backend and Svelte frontend

## Quick Start

### Prerequisites

- [Go 1.21+](https://golang.org/dl/)
- [Node.js 22+](https://nodejs.org/)
- [Docker](https://docker.com/) (optional)

### Development Setup

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

### Production Deployment

#### Using Docker (Recommended)

```bash
# Build and run
make run-docker

# Or with docker-compose
docker-compose up --build
```

#### Manual Build

```bash
# Build frontend
cd frontend && npm install && npm run build

# Build backend
cd backend && go build -o schist ./cmd/schist

# Run
./backend/schist
```

Your wiki will be available at http://localhost:8080

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

## Available Commands

```bash
# Development
make run-backend           # Start Go backend server
make run-frontend          # Start Svelte dev server
make run-e2e              # Run end-to-end tests

# Production
make run-docker           # Build and run with Docker
make run-docker-dev       # Development with Docker

# Testing
# API testing files in http/ directory
# Use VS Code REST Client extension
```

## Configuration

### Environment Variables

- `SCHIST_PORT` - Server port (default: 8080)
- `SCHIST_DATA_DIR` - Data directory (default: ./data)
- `NODE_ENV` - Environment (development/production)
- `SCHIST_FRONTEND_URL` - Frontend URL for CORS (default: http://localhost:5173)

### Development vs Production

**Development Mode:**
- Backend serves API only with CORS enabled
- Frontend runs on separate dev server with hot reload
- Environment: `NODE_ENV=development`

**Production Mode:**
- Backend serves both API and static files
- Single server deployment
- Environment: `NODE_ENV=production`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/pages` | List all pages |
| GET | `/api/pages/:slug` | Get page by slug |
| POST | `/api/pages` | Create new page |
| PUT | `/api/pages/:slug` | Update page |
| DELETE | `/api/pages/:slug` | Delete page |
| GET | `/api/search?q=query` | Search pages |

## Data Storage

Schist stores all data as plain files:

```
data/
├── pages/                 # Markdown files
│   ├── index.md
│   ├── getting-started.md
│   └── project-ideas.md
├── assets/               # Images and files
│   ├── images/
│   └── files/
└── .schist/             # Metadata
    ├── config.json
    └── search-index.json
```

## Roadmap

### MVP (Current)
- [ ] Basic file operations (CRUD)
- [ ] Markdown editor with preview
- [ ] Wiki linking with `[[Page Name]]` syntax
- [ ] Basic search functionality
- [ ] Docker deployment
- [ ] File watching and auto-indexing
- [ ] Responsive UI design

### Phase 2
- [ ] Graph view of page connections
- [ ] Advanced search with filters
- [ ] Tag support
- [ ] Export functionality (PDF, HTML)
- [ ] Page templates

### Phase 3
- [ ] Real-time collaboration
- [ ] Git integration
- [ ] Plugin system
- [ ] Mobile app

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](docs/)
- 🐛 [Issues](https://github.com/MorrisMorrison/schist/issues)
- 💬 [Discussions](https://github.com/MorrisMorrison/schist/discussions)

---

Built with ❤️ using Go and Svelte
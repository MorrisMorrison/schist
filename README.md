# Schist 🪨

[![Build](https://github.com/MorrisMorrison/schist/actions/workflows/build.yml/badge.svg)](https://github.com/MorrisMorrison/schist/actions/workflows/build.yml)
[![E2E Tests](https://github.com/MorrisMorrison/schist/actions/workflows/e2e.yml/badge.svg)](https://github.com/MorrisMorrison/schist/actions/workflows/e2e.yml)
[![Test](https://github.com/MorrisMorrison/schist/actions/workflows/test.yml/badge.svg)](https://github.com/MorrisMorrison/schist/actions/workflows/test.yml)

> **"Obsidian is volcanic glass—beautiful but complex. Schist is simple rock that splits into perfect layers, just like your knowledge base should."**

Schist is a lightweight, self-hosted markdown wiki that brings Obsidian-like functionality to the web browser. Schist focuses on simplicity, speed, and ease of use while maintaining the power of interconnected knowledge management.

## Features

- 📝 **Markdown-first** - Write in plain markdown with live preview
- 🔗 **Wiki linking** - Connect documents with `[[Document Name]]` syntax
- 🔍 **Full-text search** - Find content across all your documents
- 📁 **File-based storage** - No database required, just markdown files
- 🌐 **Web-based** - Access your wiki from any browser
- 🎨 **Clean interface** - Responsive design with dark/light themes
- 🐳 **Docker ready** - Easy deployment with Docker
- ⚡ **Fast** - Built with Go backend and Svelte frontend
- ⌨️ **Keyboard shortcuts** - Navigate efficiently with global hotkeys

## Installation

### Docker (Recommended)

The easiest way to run Schist is using Docker:

```bash
docker pull ghcr.io/morrismorrison/schist:latest
docker run -d \
  --name schist \
  -p 8080:8080 \
  -v $(pwd)/data:/app/data \
  -e ENV=production \
  ghcr.io/morrismorrison/schist:latest
```

### Docker Compose

For a more permanent setup, create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  schist:
    image: ghcr.io/morrismorrison/schist:latest
    container_name: schist
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      - ENV=production
      - SCHIST_PORT=8080
      - SCHIST_DATA_DIR=/app/data
      # Optional: Enable authentication
      # - SCHIST_AUTH_ENABLED=true
      # - SCHIST_AUTH_USERS=admin:$2a$10$your_bcrypt_hash_here
      # Optional: Enable rate limiting
      # - SCHIST_RATE_LIMIT_ENABLED=true
      # - SCHIST_RATE_LIMIT_RPM=100
```

Then run:
```bash
docker-compose up -d
```

Your wiki will be available at http://localhost:8080 (or your server's address)

### Configuration

Schist works out of the box with minimal configuration. For advanced setup including authentication, rate limiting, and security options, see the [Configuration Guide](docs/CONFIGURATION.md).

## Quick Start

### Development

```bash
# Clone and install dependencies
git clone https://github.com/MorrisMorrison/schist.git
cd schist
make install

# Terminal 1: Backend
make run-backend

# Terminal 2: Frontend  
make run-frontend
```

Open http://localhost:5173 in your browser.

### Production
```bash
# Using Docker (recommended)
make run-docker

# Or build manually
make build
cd backend && ./schist
```

Schist will be available at http://localhost:8080

## Keyboard Shortcuts

Schist provides powerful keyboard shortcuts for efficient navigation and document management:

### Navigation
- `Cmd/Ctrl + K` - Open Quick Switcher (search and navigate to documents)
- `Cmd/Ctrl + H` - Go to Home
- `Cmd/Ctrl + ,` - Go to Settings

### Document Actions
- `Cmd/Ctrl + N` - Create new document
- `Cmd/Ctrl + Shift + N` - Create new folder
- `Cmd/Ctrl + E` - Edit current document *(when viewing)*
- `Cmd/Ctrl + D` - Delete current document *(when viewing)*
- `Cmd/Ctrl + S` - Download current document *(when viewing)*

### UI Controls
- `Cmd/Ctrl + T` - Toggle dark/light theme
- `Cmd/Ctrl + B` - Toggle sidebar
- `Escape` - Close Quick Switcher or modals

**💡 Tip:** Press `Cmd/Ctrl + K` to open the Quick Switcher, then start typing to instantly search and navigate to any document!

## Documentation

- [📚 Quick Start Guide](docs/QUICK_START.md) - Get up and running
- [🔧 API Documentation](docs/API.md) - Complete API reference
- [⚙️ Configuration](docs/CONFIGURATION.md) - Environment setup
- [💻 Development Guide](docs/DEVELOPMENT.md) - Contributing guide
- [📋 Design Document](docs/DESIGN_DOC.md) - Architecture overview

## Contributing

Contributions are welcome! Please see the [Development Guide](docs/DEVELOPMENT.md) for details on setting up your development environment and contributing guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](docs/)
- 🐛 [Issues](https://github.com/MorrisMorrison/schist/issues)
- 💬 [Discussions](https://github.com/MorrisMorrison/schist/discussions)

---

Built with ❤️ using Go and Svelte
# Schist 🪨

[![Build](https://github.com/MorrisMorrison/schist/actions/workflows/build.yml/badge.svg)](https://github.com/MorrisMorrison/schist/actions/workflows/build.yml)
[![E2E Tests](https://github.com/MorrisMorrison/schist/actions/workflows/e2e.yml/badge.svg)](https://github.com/MorrisMorrison/schist/actions/workflows/e2e.yml)
[![Test](https://github.com/MorrisMorrison/schist/actions/workflows/test.yml/badge.svg)](https://github.com/MorrisMorrison/schist/actions/workflows/test.yml)

Schist is a lightweight, self-hosted markdown wiki that brings Obsidian-like functionality to the web browser. Schist focuses on simplicity, speed, and ease of use while maintaining the power of interconnected knowledge management.

## Features

- **Markdown-first** - Write in plain markdown with live preview
- **Wiki linking** - Connect documents with `[[Document Name]]` syntax
- **Full-text search** - Find content across all your documents
- **File-based storage** - No database required, just markdown files
- **Web-based** - Access your wiki from any browser
- **Clean interface** - Responsive design with dark/light themes
- **Docker ready** - Easy deployment with Docker
- **Fast** - Built with Go backend and Svelte frontend
- **Secure authentication** - Optional JWT-based login with modern UI
- **Keyboard shortcuts** - Navigate efficiently with global hotkeys

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
      # Optional: Enable JWT authentication
      # - SCHIST_AUTH_ENABLED=true
      # - SCHIST_AUTH_USERS=admin:$2a$10$your_bcrypt_hash_here
      # - SCHIST_JWT_SECRET=your-secret-key-here
      # - SCHIST_JWT_EXPIRY_HOURS=24
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

#### Quick Authentication Setup

To enable authentication for your wiki:

1. **Generate a password hash:**
   ```bash
   cd backend && go run cmd/generate-hash/main.go your-password
   ```

2. **Set environment variables:**
   ```bash
   export SCHIST_AUTH_ENABLED=true
   export SCHIST_AUTH_USERS="admin:$2a$10$your_generated_hash_here"
   export SCHIST_JWT_SECRET="your-secret-key-minimum-32-characters"
   ```

3. **Start Schist:**
   ```bash
   docker-compose up -d
   # or
   make run
   ```

4. **Access your wiki:** Navigate to your wiki URL and you'll be redirected to a login page.

**Default behavior:** Authentication is **disabled** by default. All users can access the wiki without any login.

## Keyboard Shortcuts

Schist provides powerful keyboard shortcuts for efficient navigation and document management:

### Navigation
- `Cmd/Ctrl + K` - Open Quick Switcher (search and navigate to documents)
- `Cmd/Ctrl + H` - Go to Home
- `Cmd/Ctrl + ,` - Go to Settings

### Document Actions
- `Cmd/Ctrl + Shift + Y` - Create new document
- `Cmd/Ctrl + Shift + U` - Create new folder
- `Cmd/Ctrl + E` - Edit current document *(when viewing)*
- `Delete` - Delete current document *(when viewing)*
- `Cmd/Ctrl + J` - Download current document *(when viewing)*

### UI Controls
- `Cmd/Ctrl + Alt + T` - Toggle dark/light theme
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

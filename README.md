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

### Development

```bash
# Clone and start development servers
git clone https://github.com/MorrisMorrison/schist.git
cd schist

# Terminal 1: Backend
NODE_ENV=development make run-backend

# Terminal 2: Frontend  
make run-frontend
```

Open http://localhost:5173 in your browser.

### Production

```bash
# Using Docker (recommended)
make run-docker

# Or build manually
cd frontend && npm run build
cd backend && go build -o schist ./cmd/schist
./backend/schist
```

Your wiki will be available at http://localhost:8080

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
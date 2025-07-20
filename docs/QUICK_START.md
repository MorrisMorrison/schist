# Quick Start Guide

Get Schist up and running in minutes! This guide covers both development and production setups.

## Prerequisites

- **Go 1.21+** - [Download here](https://golang.org/dl/)
- **Node.js 18+** - [Download here](https://nodejs.org/) (for frontend development)
- **Docker** (optional) - [Download here](https://docker.com/) (for containerized deployment)

## Development Setup

The fastest way to start developing with Schist:

### 1. Clone the Repository
```bash
git clone https://github.com/MorrisMorrison/schist.git
cd schist
```

### 2. Install Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

### 3. Start Development Servers

```bash
# Terminal 1: Start backend
ENV=development make run-backend

# Terminal 2: Start frontend dev server
make run-frontend
```

### 4. Access the Application
- **Frontend (Development)**: http://localhost:5173
- **Backend API**: http://localhost:8080/api/health
- **Production**: http://localhost:8080 (when using Docker)

### 5. Verify Setup
Test that everything is working:
```bash
# Check backend health
curl http://localhost:8080/api/health

# Expected response:
# {"status":"ok","service":"schist"}
```

## Production Deployment

### Option 1: Docker (Recommended)

**Quick Start:**
```bash
make run-docker
```

**Custom Configuration:**
```bash
# Create data directory
mkdir -p ./wiki-data

# Start with custom data location
docker-compose up --build
```

Your wiki will be available at **http://localhost:8080**

### Option 2: Manual Build

For advanced users who want to build manually:

```bash
# 1. Build frontend
cd frontend
npm install
npm run build
cd ..

# 2. Build backend
cd backend
go build -o schist ./cmd/schist
cd ..

# 3. Create data directory
mkdir -p data/pages data/assets

# 4. Run the server
./backend/schist
```

## Available Make Commands

| Command | Purpose | Use Case |
|---------|---------|----------|
| `make run-backend` | Start Go backend server | Development |
| `make run-frontend` | Start Vite dev server | Development |
| `make run-backend-test` | Run Go unit tests | Development |
| `make run-e2e` | Run Playwright end-to-end tests | Testing |
| `make fmt` | Format both frontend and backend code | Code quality |
| `make lint` | Lint frontend code (ESLint) | Code quality |
| `make run-docker` | Build and run production container | Production |

## First Steps

Once Schist is running, here's what to do:

### 1. Create Your First Page
- Open the frontend URL in your browser
- Click "New Page" or use the `+` button
- Add a title like "Welcome to My Wiki"
- Write some content in markdown
- Save the page

### 2. Try Wiki Linking
In any page, create links to other pages:
```markdown
# Welcome to My Wiki

Check out my [[Project Ideas]] and [[Meeting Notes]].

You can also link to specific paths: [[/docs/api-reference]]
```

### 3. Upload Images
- Click the image upload button in the editor
- Select an image file (PNG, JPEG, GIF, WebP, SVG)
- The image will be automatically inserted into your page

### 4. Organize with Folders
Create nested page structures:
- `/docs/getting-started`
- `/projects/website/timeline`
- `/meeting-notes/2024/january`

Folders are created automatically when you save pages with paths.

## Configuration

### Environment Variables

Most common configurations:

```bash
# Change backend port (default: 8080)
SCHIST_PORT=8081 make run-backend

# Change data directory (default: ../../data)
SCHIST_DATA_DIR=/custom/path make run-backend

# Frontend API URL (default: http://localhost:8080/api)
PUBLIC_API_URL=http://localhost:8081/api make run-frontend
```

### Data Storage

Your wiki data is stored in the `data` directory:
```
data/
├── pages/              # Your markdown files
│   ├── welcome.md
│   └── docs/
│       └── api.md
└── assets/            # Uploaded images
    └── images/
        └── photo.jpg
```

## Troubleshooting

### Common Issues

**Port Already in Use:**
```bash
# Check what's using port 8080
lsof -i :8080

# Use different port
SCHIST_PORT=8081 make run-backend
```

**Frontend Won't Connect to Backend:**
```bash
# Verify backend is running
curl http://localhost:8080/api/health

# Check CORS in development
ENV=development make run-backend
```

**Permission Errors:**
```bash
# Make data directory writable
chmod 755 ./data
mkdir -p ./data/pages ./data/assets
```

**Docker Issues:**
```bash
# Clean up containers
docker-compose down
docker system prune

# Rebuild
make run-docker
```

### Getting Help

1. **Check logs**: Backend logs appear in the terminal where you ran `make run-backend`
2. **Browser console**: Open developer tools to see frontend errors
3. **API testing**: Use the health endpoint to verify backend connectivity
4. **GitHub Issues**: Report bugs at the project repository

## Development Workflow

### Making Changes

**Backend changes:**
1. Edit Go files in `backend/`
2. Backend automatically restarts (using `go run`)
3. Test with `make run-backend-test`

**Frontend changes:**
1. Edit Svelte files in `frontend/src/`
2. Changes appear immediately (hot reload)
3. Test with `make run-e2e`

### Code Quality

Before committing changes:
```bash
# Format code
make fmt

# Lint frontend
make lint

# Run tests
make run-backend-test
make run-e2e
```

## Next Steps

Now that Schist is running:

- **Learn the API**: Check [API Documentation](API.md) for endpoint details
- **Configure Settings**: See [Configuration](CONFIGURATION.md) for advanced options
- **Contribute**: Read the [Development Guide](DEVELOPMENT.md) for contribution guidelines
- **Deploy**: Set up production deployment with Docker or manual builds

## Example Workflow

Here's a typical development session:

```bash
# 1. Start development
git clone https://github.com/MorrisMorrison/schist.git
cd schist
cd frontend && npm install && cd ..

# 2. Run both servers
ENV=development make run-backend    # Terminal 1
make run-frontend                        # Terminal 2

# 3. Open browser to http://localhost:5173

# 4. Create pages, upload images, organize content

# 5. Before committing
make fmt && make lint && make run-backend-test
```

Welcome to your new knowledge base! 🪨
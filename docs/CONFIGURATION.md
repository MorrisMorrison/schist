# Configuration

Schist is designed with minimal configuration using environment variables and sensible defaults. No external configuration files are required.

## Environment Variables

### Backend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHIST_PORT` | `8080` | Server port number |
| `SCHIST_DATA_DIR` | `../../data` | Directory for storing wiki pages and assets |
| `SCHIST_STATIC_DIR` | `./web` | Directory for serving static frontend files (production) |
| `SCHIST_FRONTEND_URL` | `http://localhost:5173` | Frontend URL for CORS configuration (development) |
| `ENV` | `development` | Environment mode (development/production) |

### Frontend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_API_URL` | `http://localhost:8080/api` | Backend API URL for client-side calls |

## Development vs Production

### Development Mode (`ENV=development`)

**Features:**
- **CORS enabled** - Allows frontend dev server to access API
- **Debug logging** - Detailed output with file:line information
- **Gin debug mode** - Verbose HTTP request logging
- **Separate servers** - Backend (8080) and frontend (5173)
- **Hot reload** - Frontend changes update immediately

**Setup:**
```bash
# Terminal 1: Start backend
ENV=development make run-backend

# Terminal 2: Start frontend dev server
make run-frontend

# Access: http://localhost:5173
```

### Production Mode (`ENV != development`)

**Features:**
- **Single server** - Backend serves both API and static files
- **Gin release mode** - Optimized performance and minimal logging
- **No CORS** - Same-origin policy only
- **Static file serving** - Serves built frontend from SCHIST_STATIC_DIR
- **SPA routing** - Fallback to index.html for client-side routes

**Setup:**
```bash
# Using Docker (recommended)
make run-docker

# OR manual build
cd frontend && npm run build
cd ../backend && go build -o schist ./cmd/schist
./schist

# Access: http://localhost:8080
```

## Data Storage Structure

Schist stores all data as plain files in the data directory with hierarchical organization:

```
data/
├── pages/                    # Markdown files organized hierarchically
│   ├── welcome.md           # Root-level page (/welcome)
│   ├── docs/                # Folder-based organization
│   │   ├── api.md          # Nested page (/docs/api)
│   │   ├── configuration.md # Nested page (/docs/configuration)
│   │   └── getting-started/ # Deeper nesting
│   │       └── index.md    # Page at /docs/getting-started/index
│   ├── projects/           # Project documentation
│   │   ├── website/
│   │   │   ├── overview.md
│   │   │   └── timeline.md
│   │   └── mobile-app.md
│   └── trash/              # Soft-deleted pages
│       └── deleted-page.md
├── assets/                 # Uploaded files
│   ├── images/            # Image uploads (PNG, JPEG, GIF, WebP, SVG)
│   │   ├── a1b2c3-photo.jpg
│   │   └── def456-diagram.png
│   └── documents/         # Other file types
└── .gitkeep              # Ensures directory exists in git
```

### Page File Format

Pages are stored as markdown files with YAML front matter:

```markdown
---
title: Page Title
path: /hierarchical/path
created: 2024-01-15T10:30:00Z
updated: 2024-01-15T10:30:00Z
tags:
  - documentation
  - api
---

# Page Content

Your markdown content here with support for:

- [[Wiki Links]] to other pages
- ![Images](/assets/images/filename.jpg)
- Standard markdown formatting
```

## Docker Configuration

### Production Deployment

**docker-compose.yml:**
```yaml
services:
  schist:
    image: schist:latest
    ports:
      - "8080:8080"
    environment:
      - SCHIST_DATA_DIR=/app/data
      - SCHIST_PORT=8080
      - ENV=production
    volumes:
      - ./wiki-data:/app/data
```

### Development with Docker

**docker-compose.yml (development profile):**
```yaml
services:
  schist-dev:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SCHIST_DATA_DIR=/app/data
      - ENV=development
    volumes:
      - ./data:/app/data
      - ./backend:/app/backend
    
  frontend-dev:
    build:
      context: ./frontend
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
```

**Commands:**
```bash
# Production
make run-docker

# Development
make run-docker-dev
```

## Asset Management Configuration

### Upload Settings

| Setting | Value | Description |
|---------|-------|-------------|
| **Max file size** | 10MB | Maximum upload size per file |
| **Allowed types** | JPEG, PNG, GIF, WebP, SVG | Supported image formats |
| **Storage path** | `{DATA_DIR}/assets/images/` | Physical storage location |
| **URL path** | `/api/assets/images/` | API access path |
| **Static path** | `/uploads/images/` | Direct static access |
| **Naming** | MD5 hash + original extension | Auto-generated unique filenames |

### Asset Access Methods

1. **API Route**: `/api/assets/images/filename.jpg` (with security validation)
2. **Static Route**: `/uploads/images/filename.jpg` (direct file serving)

## Frontend Build Configuration

### Vite Configuration (vite.config.ts)

```typescript
export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  test: {
    // Browser and server-side testing
    environment: 'jsdom'
  }
});
```

### SvelteKit Configuration (svelte.config.js)

```javascript
import { sveltekit } from '@sveltejs/kit/vite';

export default {
  kit: {
    adapter: adapter({
      fallback: 'index.html'  // SPA mode
    }),
    prerender: { entries: [] }
  }
};
```

## Security Configuration

### CORS Policy

**Development Mode:**
```javascript
// Gin CORS middleware enabled
AllowOrigins: [SCHIST_FRONTEND_URL]
AllowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
AllowHeaders: ["Origin", "Content-Type", "Accept", "Authorization"]
AllowCredentials: true
```

**Production Mode:**
- No CORS middleware (same-origin only)
- Static file serving with security headers

### File Security

- **Path validation**: Regex `[a-zA-Z0-9\-_/]+`
- **Directory traversal protection**: Blocks `..` segments
- **Maximum depth**: 10 levels in hierarchy
- **File scoping**: All operations limited to `SCHIST_DATA_DIR`

### Input Validation

- **File uploads**: MIME type and extension validation
- **Page paths**: Sanitized and normalized
- **YAML front matter**: Safe parsing with validation

## Logging Configuration

### Development Logging
```
[GIN-debug] Listening and serving HTTP on :8080
[CORS] Origin: http://localhost:5173 allowed
main.go:45: Server starting in development mode
```

### Production Logging
```
2024-01-15T10:30:00Z Server starting on port 8080
```

## Build Commands Configuration

Available make targets and their purposes:

| Command | Purpose | Environment |
|---------|---------|-------------|
| `make run-backend` | Start Go backend server | Development |
| `make run-frontend` | Start Vite dev server | Development |
| `make run-backend-test` | Run Go tests | Development |
| `make run-e2e` | Run Playwright tests | Development |
| `make fmt` | Format frontend and backend code | Both |
| `make lint` | Lint frontend code | Development |
| `make run-docker` | Build and start production container | Production |
| `make run-docker-dev` | Start development containers | Development |

## Troubleshooting Configuration

### Common Issues

**Port conflicts:**
```bash
# Change backend port
SCHIST_PORT=8081 make run-backend

# Change frontend port
PORT=3000 make run-frontend
```

**Data directory permissions:**
```bash
# Ensure data directory is writable
chmod 755 ./data
mkdir -p ./data/pages ./data/assets
```

**CORS issues in development:**
```bash
# Verify frontend URL matches
SCHIST_FRONTEND_URL=http://localhost:5173 make run-backend
```

**Docker volume issues:**
```bash
# Ensure host directory exists
mkdir -p ./wiki-data
```

### Configuration Validation

To verify your configuration is working:

1. **Health check**: `curl http://localhost:8080/api/health`
2. **Frontend access**: Open browser to configured port
3. **File creation**: Try creating a page through the UI
4. **Asset upload**: Test image upload functionality

## Advanced Configuration

### Custom Data Directory Structure

You can organize your data directory with any structure:

```bash
# Example: Separate environments
SCHIST_DATA_DIR=/var/lib/schist/production make run-backend
SCHIST_DATA_DIR=/var/lib/schist/staging make run-backend
```

### Reverse Proxy Configuration

For production deployments behind nginx/Apache:

```nginx
# nginx.conf
location /wiki/ {
    proxy_pass http://localhost:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Container Resource Limits

```yaml
# docker-compose.yml
services:
  schist:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
```
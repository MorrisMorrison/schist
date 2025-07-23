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
| `SCHIST_RATE_LIMIT_ENABLED` | `false` | Enable/disable rate limiting |
| `SCHIST_RATE_LIMIT_RPM` | `100` | Rate limit: requests per minute per IP |
| `SCHIST_AUTH_ENABLED` | `false` | Enable/disable basic authentication |
| `SCHIST_AUTH_USERS` | `""` | Basic auth users (format: `user1:hash1,user2:hash2`) |
| `SCHIST_AUTH_REALM` | `"Schist Wiki"` | Authentication realm name |

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

### Rate Limiting

**Configuration:**
```bash
# Enable rate limiting
SCHIST_RATE_LIMIT_ENABLED=true

# Set requests per minute per IP (default: 100)
SCHIST_RATE_LIMIT_RPM=60
```

**Features:**
- **IP-based limiting**: Each IP address has independent rate limits
- **Standard HTTP headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Automatic cleanup**: Old rate limiters removed periodically
- **429 responses**: Proper "Too Many Requests" status with retry information

**Development vs Production:**
- **Development**: Rate limiting disabled by default for easier testing
- **Production**: Recommended to enable with appropriate limits for your use case

### Basic Authentication

**Configuration:**
```bash
# Enable authentication for all endpoints
SCHIST_AUTH_ENABLED=true

# Set username:password_hash pairs
SCHIST_AUTH_USERS="admin:$2a$10$hash1,editor:$2a$10$hash2"

# Set authentication realm (optional)
SCHIST_AUTH_REALM="My Private Wiki"
```

**Password Hash Generation:**
```bash
# Using the provided utility
cd backend && go build -o generate-hash ./cmd/generate-hash
./generate-hash mypassword

# Output:
# Password hash: $2a$10$VPt/2dQPJTfeef0XPrBq8OhcifyVejXctDUSpPdvfQ7kl2BjKLsr6
# Environment variable example:
# SCHIST_AUTH_USERS="admin:$2a$10$VPt/2dQPJTfeef0XPrBq8OhcifyVejXctDUSpPdvfQ7kl2BjKLsr6"
```

**Authentication Features:**
- **All endpoints protected**: When enabled, authentication required for all API endpoints
- **Health endpoint exception**: `/api/health` remains unprotected for monitoring
- **Multiple users**: Support for multiple username/password combinations
- **Secure hashing**: bcrypt with configurable cost (default: 10)
- **Browser compatibility**: Works with browser basic auth prompts and custom forms
- **Timing attack prevention**: Constant-time password comparison

**Authentication Headers:**
```http
# Request
Authorization: Basic YWRtaW46cGFzc3dvcmQ=

# Response (unauthorized)
WWW-Authenticate: Basic realm="Schist Wiki"
```

### Combined Security Example

**Production Security Configuration:**
```bash
# Production environment
ENV=production

# Enable both security features
SCHIST_RATE_LIMIT_ENABLED=true
SCHIST_RATE_LIMIT_RPM=60
SCHIST_AUTH_ENABLED=true
SCHIST_AUTH_USERS="admin:$2a$10$hash,editor:$2a$10$hash2"
SCHIST_AUTH_REALM="Company Wiki"
```

### CORS Policy

**Development Mode:**
```javascript
// Gin CORS middleware enabled
AllowOrigins: [SCHIST_FRONTEND_URL]
AllowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
AllowHeaders: ["Origin", "Content-Type", "Accept", "Authorization"]
ExposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"]
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
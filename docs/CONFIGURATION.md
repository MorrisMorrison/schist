# Configuration

Schist is designed with minimal configuration using environment variables and sensible defaults. No external configuration files are required.

## Environment Variables

### Backend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHIST_PORT` | `8080` | Server port number |
| `SCHIST_DATA_DIR` | `../../data` | Directory for storing wiki documents and assets |
| `SCHIST_STATIC_DIR` | `./web` | Directory for serving static frontend files (production) |
| `SCHIST_FRONTEND_URL` | `http://localhost:5173` | Frontend URL for CORS configuration (development) |
| `ENV` | `development` | Environment mode (development/production) |
| `SCHIST_RATE_LIMIT_ENABLED` | `false` | Enable/disable rate limiting |
| `SCHIST_RATE_LIMIT_RPM` | `100` | Rate limit: requests per minute per IP |
| `SCHIST_AUTH_ENABLED` | `false` | Enable/disable JWT authentication |
| `SCHIST_AUTH_USERS` | `""` | User credentials (format: `user1:hash1,user2:hash2`) |
| `SCHIST_JWT_SECRET` | `""` | JWT signing secret (required when auth is enabled) |
| `SCHIST_JWT_EXPIRY_HOURS` | `24` | JWT token expiry time in hours |

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

## Security Configuration

### Rate Limiting

**Configuration:**
```bash
# Enable rate limiting
SCHIST_RATE_LIMIT_ENABLED=true

# Set requests per minute per IP (default: 100)
SCHIST_RATE_LIMIT_RPM=60
```

### JWT Authentication

**Configuration:**
```bash
# Enable JWT authentication for all endpoints
SCHIST_AUTH_ENABLED=true

# Set username:password_hash pairs
SCHIST_AUTH_USERS="admin:$2a$10$hash1,editor:$2a$10$hash2"

# JWT secret key (REQUIRED when auth is enabled)
SCHIST_JWT_SECRET="your-secret-key-here"

# JWT token expiry time in hours (default: 24)
SCHIST_JWT_EXPIRY_HOURS=24
```

**Security Requirements:**
- `SCHIST_JWT_SECRET` must be set when authentication is enabled
- Use a strong, randomly generated secret (minimum 32 characters)
- Keep the JWT secret secure and never commit it to version control

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

# Configuration

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHIST_PORT` | `8080` | Server port |
| `SCHIST_DATA_DIR` | `./data` | Directory for storing wiki data |
| `SCHIST_STATIC_DIR` | `./web` | Directory for static frontend files |
| `SCHIST_FRONTEND_URL` | `http://localhost:5173` | Frontend URL for CORS (development) |
| `NODE_ENV` | `production` | Environment mode (development/production) |

## Development vs Production

### Development Mode

Set `NODE_ENV=development` to enable:

- **CORS** - Allows frontend dev server to access API
- **Debug logging** - More verbose output
- **Hot reload** - Frontend changes update immediately
- **Separate servers** - Backend (8080) and frontend (5173)

**Setup:**
```bash
NODE_ENV=development make run-backend  # Terminal 1
make run-frontend                      # Terminal 2
```

### Production Mode

Default mode when `NODE_ENV` is not set:

- **Single server** - Backend serves both API and static files
- **Optimized builds** - Minified frontend assets
- **Security headers** - Restrictive CORS policy
- **Release mode** - Less verbose logging

**Setup:**
```bash
make run-docker  # Recommended
# OR
npm run build && go run ./cmd/schist
```

## Data Storage

Schist stores all data as plain files in the data directory:

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

## Docker Configuration

### Environment Variables

```yaml
# docker-compose.yml
environment:
  - SCHIST_DATA_DIR=/app/data
  - SCHIST_PORT=8080
```

### Volume Mounting

```yaml
# docker-compose.yml
volumes:
  - ./wiki-data:/app/data  # Persistent storage
```

### Port Mapping

```yaml
# docker-compose.yml
ports:
  - "8080:8080"  # Host:Container
```

## Security

### CORS Policy

**Development:**
- Allows requests from `SCHIST_FRONTEND_URL`
- Permissive for development ease

**Production:**
- Allows requests from same origin only
- Restrictive headers and methods

### File Access

- All file operations are scoped to `SCHIST_DATA_DIR`
- Path traversal protection
- Input validation on file names

## Logging

**Development:**
- Gin debug mode enabled
- CORS configuration logged
- Detailed request logging

**Production:**
- Gin release mode
- Error logging only
- Performance optimized
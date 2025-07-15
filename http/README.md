# HTTP API Test Files

This directory contains `.http` files for testing the Schist API endpoints using VS Code REST Client extension or similar tools.

## Files

- `health.http` - Health check and CORS testing
- `pages.http` - CRUD operations for wiki pages
- `search.http` - Search functionality tests

## Usage

### With VS Code REST Client Extension

1. Install the "REST Client" extension in VS Code
2. **Select environment**: In VS Code, press `Ctrl+Shift+P` and search for "Rest Client: Switch Environment", then choose:
   - `dev` - Development mode (separate frontend/backend)
   - `prod` - Production mode (single server)
   - `docker` - Docker deployment
3. Open any `.http` file
4. Click "Send Request" above each HTTP request
5. View responses in the output panel

### Environment Variables

The `.http` files use variables from `http-client.env.json`:

- `{{apiUrl}}` - API base URL
- `{{frontendUrl}}` - Frontend URL (for CORS testing)
- `{{baseUrl}}` - Server base URL

### With curl (alternative)

```bash
# Health check
curl http://localhost:8080/api/health

# List pages
curl http://localhost:8080/api/pages

# Create page
curl -X POST http://localhost:8080/api/pages \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Page", "content": "# Test\n\nThis is a test."}'

# Search
curl "http://localhost:8080/api/search?q=test"
```

## Server Setup

Make sure the backend server is running:

```bash
# Development mode (with CORS)
NODE_ENV=development make run-backend

# Production mode
make run-backend
```

## Expected Responses

All endpoints return JSON responses:

- `GET /api/health` → `{"status": "ok", "service": "schist"}`
- `GET /api/pages` → `{"pages": [], "total": 0}`
- `POST /api/pages` → `{"message": "Page created successfully"}`
- `GET /api/search` → `{"query": "...", "results": [], "total": 0}`

Note: These are placeholder responses. Real implementations will return actual data from the file system.
# HTTP API Test Files

This directory contains `.http` files for testing the Schist API endpoints using VS Code REST Client extension or similar tools.

## Files

- `health.http` - Health check and CORS testing
- `pages.http` - CRUD operations for wiki pages  
- `search.http` - Search functionality tests
- `page-service-tests.http` - **Comprehensive PageService API testing** (recommended starting point)
- `VSCODE_SETUP.md` - Detailed VS Code REST Client setup guide

## Usage

### With VS Code REST Client Extension

**Quick Setup**: See [VSCODE_SETUP.md](./VSCODE_SETUP.md) for detailed instructions.

1. Install the "REST Client" extension in VS Code
2. **Select environment**: Press `Ctrl+Shift+P` → "Rest Client: Switch Environment":
   - `dev` - Development (separate frontend at :5173, backend at :8080)
   - `local` - Local backend only (:8080) 
   - `docker` - Docker deployment (:8080)
   - `prod` - Production (:8080)
3. Open any `.http` file (start with `page-service-tests.http`)
4. Click "Send Request" above each HTTP request
5. View responses in the new tab that opens

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
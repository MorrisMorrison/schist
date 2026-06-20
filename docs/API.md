# API Documentation

Schist provides a complete RESTful API for managing a hierarchical markdown wiki with folder organization, asset management, and full-text search.

## Base URL

- Development: `http://localhost:8080/api`
- Production: `http://localhost:8080/api`

## Authentication

Authentication is **optional** and can be enabled via environment variables.

### No Authentication (Default)
By default, all endpoints are publicly accessible without authentication.

### JWT Authentication (Optional)
When enabled (`SCHIST_AUTH_ENABLED=true`), all endpoints except `/api/health` require authentication via a JWT bearer token.

**Configuration:**
```bash
SCHIST_AUTH_ENABLED=true
```

**Request Headers:**
```http
Authorization: Bearer <jwt-token>
```

**Unauthorized Response (401):**
```json
{
  "error": "Unauthorized",
  "message": "Authentication required to access this resource"
}
```

## Rate Limiting

Rate limiting is **optional** and can be enabled to prevent abuse.

**Configuration:**
```bash
SCHIST_RATE_LIMIT_ENABLED=true
SCHIST_RATE_LIMIT_RPM=100  # requests per minute per IP
```

**Response Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642694400
```

**Rate Limited Response (429):**
```json
{
  "error": "Rate limit exceeded", 
  "message": "Too many requests. Please try again later.",
  "retryAfter": 60
}
```

## Data Models

### Document Object
```json
{
  "metaData": {
    "slug": "welcome-to-schist",
    "title": "Welcome to Schist",
    "path": "/welcome-to-schist",
    "created": "2024-01-15T10:30:00Z",
    "updated": "2024-01-15T10:30:00Z",
    "tags": ["welcome", "getting-started"]
  },
  "content": "# Welcome to Schist\n\nMarkdown content here..."
}
```

### Folder Object
```json
{
  "name": "docs",
  "path": "/docs",
  "created": "2024-01-15T10:30:00Z",
  "document_count": 5,
  "sub_folders": [...]
}
```

### Asset Object
```json
{
  "name": "generated-filename.png",
  "original_name": "upload.png",
  "path": "/assets/images/generated-filename.png",
  "size": 1024000,
  "content_type": "image/png",
  "created": "2024-01-15T10:30:00Z"
}
```

## Endpoints

### Health & System

#### Health Check
**GET** `/api/health`

Check if the server is running.

**Response:**
```json
{
  "status": "ok",
  "service": "schist"
}
```

### Document Management

Documents in Schist are organized hierarchically using path-based routing. Paths like `/docs/api` create nested folder structures automatically.

#### List All Documents
**GET** `/api/documents`

Retrieve all wiki documents with metadata. Automatically excludes documents in the `/trash` folder.

**Response:**
```json
{
  "documents": [
    {
      "metaData": {
        "slug": "welcome-to-schist",
        "title": "Welcome to Schist",
        "path": "/welcome-to-schist",
        "created": "2024-01-15T10:30:00Z",
        "updated": "2024-01-15T10:30:00Z",
        "tags": ["welcome", "getting-started"]
      },
      "content": "# Welcome to Schist\n\nMarkdown content here..."
    }
  ],
  "total": 1
}
```

#### Get Document by Path
**GET** `/api/documents/*path`

Retrieve a specific document by its hierarchical path.

**Path Examples:**
- `/api/documents/welcome` - Root level document
- `/api/documents/docs/api` - Nested document in docs folder
- `/api/documents/projects/2024/website` - Deeply nested document

**Response:** Single document object (same structure as in list response)

**Error Responses:**
- `404` - Document not found

#### Create New Document
**POST** `/api/documents`

Create a new wiki document. The system automatically generates slugs and paths if not provided.

**Request Body:**
```json
{
  "metaData": {
    "title": "Document Title",
    "path": "/optional-custom-path",
    "tags": ["tag1", "tag2"]
  },
  "content": "# Markdown Content\n\nYour content here..."
}
```

**Auto-Generated Fields:**
- `slug` - URL-friendly identifier from title
- `path` - Hierarchical path from slug if not provided
- `created` and `updated` - Current timestamp

**Response:**
```json
{
  "message": "Document created successfully",
  "path": "/generated-or-custom-path"
}
```

#### Update Document
**PUT** `/api/documents/*path`

Update an existing document. Can move documents by changing the path in metadata.

**Request Body:** Same as create document

**Special Behavior:** If the path in metadata differs from the URL path, the document will be moved to the new location.

**Response:**
```json
{
  "message": "Document updated successfully",
  "path": "/current-path"
}
```

#### Delete Document (Move to Trash)
**DELETE** `/api/documents/*path`

Soft delete a document by moving it to the `/trash` directory.

**Response:**
```json
{
  "message": "Document moved to trash successfully",
  "path": "/original-path"
}
```

#### Move Document
**POST** `/api/documents/move`

Move a document to a different location in the hierarchy.

**Request Body:**
```json
{
  "oldPath": "/current/path",
  "newPath": "/new/path"
}
```

**Response:**
```json
{
  "message": "Document moved successfully",
  "oldPath": "/current/path",
  "newPath": "/new/path"
}
```

### Folder Management

Folders organize documents hierarchically and are created automatically when documents are placed in them.

#### Get Folder Tree
**GET** `/api/folders`

Retrieve the complete folder hierarchy with document counts.

**Response:**
```json
{
  "folders": [
    {
      "name": "docs",
      "path": "/docs",
      "created": "2024-01-15T10:30:00Z",
      "document_count": 5,
      "sub_folders": [
        {
          "name": "api",
          "path": "/docs/api",
          "created": "2024-01-15T10:30:00Z",
          "document_count": 2,
          "sub_folders": []
        }
      ]
    }
  ],
  "total": 3
}
```

#### Get Specific Folder
**GET** `/api/folders/*path`

Get folder contents and metadata for a specific path.

**Path Examples:**
- `/api/folders/` - Root folder
- `/api/folders/docs` - Docs folder
- `/api/folders/projects/2024` - Nested folder

**Response:** Single folder object with immediate children

#### Create Folder
**POST** `/api/folders/*path`

Create a new directory structure.

**Response:**
```json
{
  "message": "Folder created successfully",
  "path": "/created/path"
}
```

#### Delete Folder
**DELETE** `/api/folders/*path`

Remove a folder and all its contents permanently.

**Protection:** Cannot delete the root folder (`/`)

**Response:**
```json
{
  "message": "Folder deleted successfully",
  "path": "/deleted/path"
}
```

### Search

#### Search Documents
**GET** `/api/search?q={query}`

Full-text search across document titles (case-insensitive). Excludes documents in `/trash`.

**Query Parameters:**
- `q` (string, required) - Search term

**Examples:**
- `/api/search?q=getting started`
- `/api/search?q=API`

**Response:**
```json
{
  "query": "search term",
  "documents": [
    {
      "metaData": {
        "title": "Getting Started Guide",
        "path": "/docs/getting-started",
        ...
      },
      "content": "..."
    }
  ],
  "total": 2
}
```

### Asset Management

Upload and manage images and media files for use in wiki documents.

#### Upload Asset
**POST** `/api/assets/upload`

Upload an image or media file.

**Content-Type:** `multipart/form-data`
**Form Field:** `file`

**Supported Types:** JPEG, PNG, GIF, WebP, SVG
**Size Limit:** 10MB
**File Naming:** Auto-generated unique names with MD5 hash

**Response:**
```json
{
  "message": "Asset uploaded successfully",
  "asset": {
    "name": "a1b2c3d4e5f6-original.png",
    "original_name": "screenshot.png",
    "path": "/assets/images/a1b2c3d4e5f6-original.png",
    "size": 1024000,
    "content_type": "image/png",
    "created": "2024-01-15T10:30:00Z"
  }
}
```

**Usage in Markdown:**
```markdown
![Description](/assets/images/a1b2c3d4e5f6-original.png)
```

#### Serve Asset
**GET** `/api/assets/*path`

Serve uploaded files with appropriate headers.

**Path Examples:**
- `/api/assets/images/file.png`
- `/api/assets/documents/file.pdf`

**Response:** Binary file content with appropriate MIME type

#### Delete Asset
**DELETE** `/api/assets/*path`

Remove an uploaded file permanently.

**Response:**
```json
{
  "message": "Asset deleted successfully",
  "path": "/assets/images/file.png"
}
```

## Static File Serving

### Upload Directory Access
**GET** `/uploads/*path`

Direct static access to uploaded assets (maps to `{dataDir}/assets/`).

**Examples:**
- `http://localhost:8080/uploads/images/file.png`
- `http://localhost:8080/uploads/documents/file.pdf`

## Error Handling

### Standard Error Response
```json
{
  "error": "Descriptive error message"
}
```

### HTTP Status Codes
- **200** - Success
- **201** - Created (new documents/folders/assets)
- **400** - Bad Request (validation errors, invalid JSON)
- **404** - Not Found (missing documents/folders/assets)
- **500** - Internal Server Error (filesystem/parsing errors)

## Path and Security Validation

### Path Rules
- **Valid Characters:** `[a-zA-Z0-9\-_/]+`
- **Maximum Depth:** 10 levels
- **Directory Traversal:** Blocked (`..` segments rejected)
- **Auto-Normalization:** Leading slashes added automatically

### File Storage Format
Documents are stored as markdown files with YAML front matter:

```markdown
---
title: Document Title
path: /document-path
created: 2024-01-15T10:30:00Z
updated: 2024-01-15T10:30:00Z
tags:
  - tag1
  - tag2
---

# Markdown Content

Your document content here...
```

## Development Notes

### CORS Configuration
In development mode (`ENV=development`), CORS is enabled for frontend development server access.

### Testing
HTTP test files are available in the `/http` directory for API testing with VS Code REST Client extension.

## Examples

### Creating a Nested Document Structure
```bash
# Create a project documentation hierarchy
POST /api/documents
{
  "metaData": {
    "title": "Project Overview",
    "path": "/projects/website/overview"
  },
  "content": "# Website Project\n\nThis is our main website project."
}

# This automatically creates the folders: /projects/website/
```

### Wiki Linking Between Documents
```markdown
# In any document content
Check out our [[API Documentation]] or [[/docs/getting-started]].

# Both create clickable links in the frontend
```

### Asset Workflow
```bash
# 1. Upload image
POST /api/assets/upload (with file)
# Returns: {"asset": {"path": "/assets/images/abc123-photo.jpg"}}

# 2. Use in markdown
![My Photo](/assets/images/abc123-photo.jpg)

# 3. Image is accessible at both:
# - /api/assets/images/abc123-photo.jpg (API route)
# - /uploads/images/abc123-photo.jpg (static route)
```
# API Documentation

## Base URL

- Development: `http://localhost:8080/api`
- Production: `http://localhost:8080/api`

## Endpoints

### Health Check

**GET** `/health`

Check if the server is running.

**Response:**
```json
{
  "status": "ok",
  "service": "schist"
}
```

### Pages

#### List All Pages

**GET** `/pages`

Get a list of all wiki pages.

**Response:**
```json
{
  "pages": [],
  "total": 0
}
```

#### Get Page

**GET** `/pages/:slug`

Get a specific page by slug.

**Parameters:**
- `slug` (string) - URL-friendly page identifier

**Response:**
```json
{
  "slug": "getting-started",
  "title": "Getting Started",
  "content": "# Getting Started\n\nWelcome to Schist!"
}
```

#### Create Page

**POST** `/pages`

Create a new wiki page.

**Request Body:**
```json
{
  "title": "Page Title",
  "content": "# Page Content\n\nYour markdown content here."
}
```

**Response:**
```json
{
  "message": "Page created successfully"
}
```

#### Update Page

**PUT** `/pages/:slug`

Update an existing page.

**Parameters:**
- `slug` (string) - Page identifier

**Request Body:**
```json
{
  "title": "Updated Title",
  "content": "# Updated Content\n\nNew content here."
}
```

**Response:**
```json
{
  "message": "Page updated successfully",
  "slug": "getting-started"
}
```

#### Delete Page

**DELETE** `/pages/:slug`

Delete a page.

**Parameters:**
- `slug` (string) - Page identifier

**Response:**
```json
{
  "message": "Page deleted successfully",
  "slug": "getting-started"
}
```

### Search

#### Search Pages

**GET** `/search`

Search for pages containing the query.

**Query Parameters:**
- `q` (string) - Search query

**Response:**
```json
{
  "query": "search term",
  "results": [],
  "total": 0
}
```

## Testing

Use the HTTP files in the `/http` directory to test the API:

1. Install VS Code REST Client extension
2. Open any `.http` file in the `/http` directory
3. Select environment (dev/prod/docker)
4. Click "Send Request"

See [HTTP Testing Guide](../http/README.md) for details.
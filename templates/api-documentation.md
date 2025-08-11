---
title: API Documentation
description: Template for documenting REST APIs, endpoints, and technical specifications
tags: ["api", "documentation", "development"]
category: technical
---

# {{API_NAME}} API Documentation

## Overview
Brief description of what this API does and its main purpose.

**Base URL:** `https://api.example.com/v1`
**Version:** 1.0
**Last Updated:** {{date}}

## Authentication
Explain how to authenticate with the API.

```bash
# Example authentication
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     https://api.example.com/v1/endpoint
```

## Rate Limiting
- **Requests per minute:** 100
- **Requests per hour:** 1000
- **Rate limit headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`

## Common Response Format

### Success Response
```json
{
  "status": "success",
  "data": {
    // Response data here
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

### Error Response
```json
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": "Additional error context"
  }
}
```

## Endpoints

### GET /resource
Get a list of resources.

**Parameters:**
- `limit` (integer, optional) - Number of results to return (default: 20, max: 100)
- `offset` (integer, optional) - Number of results to skip (default: 0)
- `filter` (string, optional) - Filter criteria

**Example Request:**
```bash
curl -X GET "https://api.example.com/v1/resource?limit=10&filter=active" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

**Example Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "name": "Resource Name",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "meta": {
    "total": 150,
    "limit": 10,
    "offset": 0
  }
}
```

### POST /resource
Create a new resource.

**Request Body:**
```json
{
  "name": "string (required)",
  "description": "string (optional)",
  "active": "boolean (optional, default: true)"
}
```

**Example Request:**
```bash
curl -X POST "https://api.example.com/v1/resource" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"New Resource","description":"Description here"}'
```

**Example Response:**
```json
{
  "status": "success",
  "data": {
    "id": 123,
    "name": "New Resource",
    "description": "Description here",
    "active": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### GET /resource/{id}
Get a specific resource by ID.

**Path Parameters:**
- `id` (integer, required) - The resource ID

**Example Response:** Same as POST response above.

### PUT /resource/{id}
Update an existing resource.

**Request Body:** Same as POST endpoint.

### DELETE /resource/{id}
Delete a specific resource.

**Example Response:**
```json
{
  "status": "success",
  "message": "Resource deleted successfully"
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | The request is malformed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `SERVER_ERROR` | 500 | Internal server error |

## SDKs and Libraries
- [JavaScript SDK](https://example.com)
- [Python SDK](https://example.com)
- [Go SDK](https://example.com)

## Changelog
### Version 1.0 ({{date}})
- Initial API release
- Core CRUD operations
- Authentication system
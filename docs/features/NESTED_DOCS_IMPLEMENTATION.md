# Nested Docs Implementation Plan: Filesystem Folders

## Overview
Implementation of nested documentation using filesystem folders with 1:1 mapping between directory structure and document organization.

## **Phase 1: Backend Data Model & Storage**

### 1.1 Update Document Model (`/backend/internal/models/document.go`)
```go
type DocumentMetaData struct {
    Slug     string    `yaml:"slug,omitempty" json:"slug,omitempty"`
    Title    string    `yaml:"title" json:"title"`
    Path     string    `yaml:"path" json:"path"`           // NEW: full path from root
    Created  time.Time `yaml:"created" json:"created"`
    Updated  time.Time `yaml:"updated" json:"updated"`
    Tags     []string  `yaml:"tags,omitempty" json:"tags,omitempty"`
}

// Helper methods to derive parent path and depth
func (d *DocumentMetaData) ParentPath() string {
    return filepath.Dir(d.Path)
}

func (d *DocumentMetaData) Depth() int {
    return strings.Count(d.Path, "/")
}
```

### 1.2 Add Folder Model
```go
type Folder struct {
    Name         string    `json:"name"`
    Path         string    `json:"path"`
    Created      time.Time `json:"created"`
    DocumentCount int      `json:"document_count"`
    SubFolders   []Folder  `json:"sub_folders"`
}

// Helper methods to derive parent path and depth
func (f *Folder) ParentPath() string {
    return filepath.Dir(f.Path)
}

func (f *Folder) Depth() int {
    return strings.Count(f.Path, "/")
}
```

### 1.3 Update Document Service (`/backend/internal/services/document_service.go`)

**New Methods:**
- `GetDocumentByPath(path string) (*Document, error)`
- `CreateDocumentInFolder(folderPath, slug string, document *Document) error`
- `MoveDocument(oldPath, newPath string) error`
- `GetFolderTree() ([]Folder, error)`
- `CreateFolder(path string) error`
- `DeleteFolder(path string) error`

**Storage Changes:**
- Replace flat file operations with path-based storage
- Implement directory creation/deletion
- Add path validation and sanitization

## **Phase 2: API Endpoints**

### 2.1 Extended Route Structure (`/backend/internal/handlers/api.go`)
```
# Existing endpoints (enhanced to support both slugs and paths)
GET    /api/documents               # List all documents (existing)
GET    /api/documents/:slug         # Get by slug (existing, backward compatible)
GET    /api/documents/*path         # Get by path (new, for nested docs)
POST   /api/documents               # Create document (existing, enhanced)
PUT    /api/documents/:slug         # Update by slug (existing)
PUT    /api/documents/*path         # Update by path (new)
DELETE /api/documents/:slug         # Delete by slug (existing)
DELETE /api/documents/*path         # Delete by path (new)

# New folder-specific endpoints
GET    /api/folders                 # Get folder tree
POST   /api/folders/*path           # Create folder
DELETE /api/folders/*path           # Delete folder

# New operations
POST   /api/documents/move          # Move document/folder
```

### 2.2 Handler Implementation Strategy
- **Extend existing handlers** to detect if parameter is slug or path
- **Path detection**: If parameter contains "/" it's a path, otherwise it's a slug
- **Backward compatibility**: All existing slug-based calls continue to work
- **No breaking changes**: Existing API consumers unaffected

## **Phase 3: Frontend API Client**

### 3.1 Update Types (`/frontend/src/lib/api/types.ts`)
```typescript
export interface DocumentMetadata {
  slug?: string;
  title: string;
  path: string;           // NEW: full path from root
  created: string;
  updated: string;
  tags?: string[];
}

export interface Folder {
  name: string;
  path: string;
  created: string;
  document_count: number;
  sub_folders: Folder[];
}

// Helper functions to derive parent path and depth
export function getParentPath(path: string): string {
  return path.split('/').slice(0, -1).join('/') || '/';
}

export function getDepth(path: string): number {
  return path.split('/').filter(segment => segment !== '').length;
}
```

### 3.2 Update API Client (`/frontend/src/lib/api/client.ts`)
```typescript
// New path-based methods
getDocumentByPath(path: string): Promise<Document>
createDocumentInFolder(folderPath: string, document: CreateDocumentRequest): Promise<Document>
moveDocument(oldPath: string, newPath: string): Promise<void>
getFolderTree(): Promise<Folder[]>
createFolder(path: string): Promise<void>
deleteFolder(path: string): Promise<void>
```

## **Phase 4: Frontend UI Components**

### 4.1 New Components
```
/frontend/src/lib/components/
├── FolderTree.svelte          # Sidebar navigation tree
├── Breadcrumbs.svelte         # Path navigation
├── FolderView.svelte          # Folder contents display
├── CreateFolderModal.svelte   # Folder creation dialog
└── MoveDocumentModal.svelte   # Document/folder moving interface
```

### 4.2 Update Existing Components
- **DocumentList.svelte**: Add folder support, tree view toggle
- **DocumentCard.svelte**: Show path info, move to folder actions
- **Navigation**: Add folder tree sidebar

### 4.3 New Routes
```
/docs                          # Root folder view
/docs/*path                    # Nested folder/document view
/docs/*path/edit               # Edit document at path
```

## **Phase 5: Migration Strategy**

### 5.1 Data Migration Script
```bash
# Create migration utility
/backend/cmd/migrate/main.go
```
- Scan existing flat files
- Create folder structure based on existing organization
- Update metadata with path information
- Preserve existing slugs for backward compatibility

### 5.2 Migration Steps
1. **Backup existing data**
2. **Run migration script** to restructure files
3. **Update API gradually** (keep both old/new endpoints)
4. **Update frontend** to use new API
5. **Remove deprecated endpoints** after grace period

## **Phase 6: Advanced Features**

### 6.1 File Operations
- Drag & drop document/folder moving
- Bulk operations (move multiple documents)
- Folder templates and scaffolding

### 6.2 Navigation Enhancements  
- Collapsible folder tree
- Recent folders/documents
- Folder bookmarking
- Search within folders

### 6.3 Permissions (Future)
- Folder-level access control
- Private/public folder settings

## **Implementation Order**

1. **Backend data model updates** (models, storage)
2. **Core API endpoints** (path-based CRUD)
3. **Migration script** (restructure existing data)
4. **Frontend API client** (new methods)
5. **Basic UI components** (folder tree, breadcrumbs)
6. **Route updates** (path-based routing)
7. **Advanced UI features** (drag & drop, bulk operations)
8. **Backward compatibility removal** (deprecate old APIs)

## **Key Technical Decisions**

- **Path separator**: Use `/` for cross-platform compatibility
- **Path validation**: Restrict special characters, validate depth limits
- **File naming**: Maintain `.md` extension, sanitize folder names
- **Concurrency**: Add file locking for move operations
- **Error handling**: Graceful degradation for missing folders

## **File Structure Changes**

### Before (Current):
```
/backend/data/
├── document1.md
├── document2.md
└── document3.md
```

### After (Nested):
```
/backend/data/
├── index.md
├── getting-started/
│   ├── installation.md
│   └── configuration.md
├── guides/
│   ├── beginner/
│   │   ├── first-steps.md
│   │   └── basic-concepts.md
│   └── advanced/
│       ├── performance.md
│       └── security.md
└── reference/
    ├── api.md
    └── cli.md
```

## **Example Path-based URLs**

- `/docs` → Root folder view
- `/docs/getting-started` → Getting started folder
- `/docs/getting-started/installation` → Installation document
- `/docs/guides/beginner/first-steps` → First steps document

## **Metadata Example**

```yaml
---
slug: "first-steps"
title: "First Steps"
path: "/guides/beginner/first-steps"
created: 2025-01-15T10:00:00Z
updated: 2025-01-15T10:00:00Z
tags: ["beginner", "tutorial"]
---

# First Steps

Your first steps content here...
```

**Note**: `parent_path` and `depth` are derived at runtime:
- Parent: `/guides/beginner` (derived from path)
- Depth: 2 (count of `/` separators)
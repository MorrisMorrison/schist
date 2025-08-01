# Schist - Design Document

## Project Overview

Schist is a lightweight, self-hosted markdown wiki that brings Obsidian-like functionality to the web browser. Named after the rock that naturally splits into thin layers (just like markdown files), Schist focuses on simplicity, speed, and ease of use while maintaining the power of interconnected knowledge management.

### Vision Statement
**"Obsidian is volcanic glass—beautiful but complex. Schist is simple rock that splits into perfect layers, just like your knowledge base should."**

Schist creates a simple, fast, and reliable web-based wiki that uses plain markdown files as storage, enabling users to build their personal knowledge base with wiki-style linking and search capabilities.

### Target Audience
- Developers and technical users who prefer markdown
- Self-hosting enthusiasts
- Teams needing lightweight documentation
- Users wanting to migrate from or complement Obsidian
- Anyone seeking a simple, portable knowledge base that "splits into layers" like schist rock

## Core Principles

1. **Simplicity First** - Minimal setup, intuitive interface
2. **File-Based Storage** - Plain markdown files, no database required
3. **Portable** - Easy to backup, migrate, and version control
4. **Fast** - Lightweight and responsive
5. **Standards-Compliant** - Uses standard markdown with minimal extensions

## Technical Architecture

### Backend
- **Language**: Go with Gin framework
- **File System**: Direct markdown file manipulation using Go's native file operations
- **Search**: Full-text search using Bleve (pure Go search engine)
- **File Watching**: fsnotify for monitoring file changes and auto-indexing
- **API**: RESTful endpoints with Gin router
- **Deployment**: Dockerized with multi-stage builds for optimal size

### Frontend
- **Framework**: Svelte 5 with SvelteKit
- **Components**: shadcn/ui components adapted for Svelte
- **Editor**: CodeMirror 6 for markdown editing
- **Rendering**: Marked.js or unified/remark for markdown to HTML
- **Styling**: Tailwind CSS with dark/light theme support
- **Build**: Vite for fast development and optimized builds

### Storage Structure
```
schist-wiki/
├── documents/
│   ├── index.md
│   ├── getting-started.md
│   └── project-ideas.md
├── assets/
│   ├── images/
│   └── files/
├── .schist/
│   ├── config.json
│   ├── search-index.json
│   └── metadata.json
└── themes/
    └── default.css
```

## Core Features

### MVP (Minimum Viable Product)

#### 1. File Management
- Create, read, update, delete markdown files
- Automatic file watching and indexing
- Support for nested folders
- File validation and error handling

#### 2. Markdown Editor
- Live preview with split-pane view
- Syntax highlighting
- Auto-save functionality
- Keyboard shortcuts (Ctrl+S, Ctrl+B, etc.)

#### 3. Wiki Linking
- `[[Page Name]]` syntax for internal links
- Automatic link resolution
- Backlink detection and display
- Broken link detection

#### 4. Basic Search
- Full-text search across all documents
- Search results with context snippets
- Real-time search suggestions

#### 5. Navigation
- File tree sidebar
- Breadcrumb navigation
- Recently viewed documents
- Quick document switcher (Ctrl+P style)

#### 6. Basic UI
- Clean, responsive design
- Dark/light theme toggle
- Mobile-friendly interface

### Phase 2 Features

#### 1. Enhanced Linking
- Link suggestions while typing
- Graph view of document connections
- Tag support with `#tag` syntax
- Automatic link previews on hover

#### 2. Advanced Search
- Search within specific folders
- Filter by tags, creation date, etc.
- Search operators (AND, OR, NOT)
- Saved searches

#### 3. Content Organization
- Favorites/bookmarks system
- Recent changes view
- Document templates
- Bulk operations (rename, move, delete)

#### 4. Collaboration Features
- Basic version history (git integration)
- Export functionality (PDF, HTML)
- Document sharing with direct links
- Read-only mode

### Phase 3 Features

#### 1. Advanced Features
- Plugin system for extensibility
- Custom themes
- Advanced graph visualization
- Table of contents generation
- Math equation support (KaTeX)

#### 2. Integration
- Git repository sync
- Webhook support
- API for external integrations
- Import from other systems (Obsidian, Notion)

## Technical Specifications

### API Endpoints

```
GET    /api/documents          - List all documents with metadata
GET    /api/documents/:slug    - Get specific document content
POST   /api/documents          - Create new document
PUT    /api/documents/:slug    - Update document content
DELETE /api/documents/:slug    - Delete document
GET    /api/search?q=query     - Search documents with Bleve
GET    /api/links/:slug        - Get document links and backlinks
POST   /api/assets             - Upload images/files
GET    /api/graph              - Get wiki link graph data
GET    /api/config             - Get wiki configuration
PUT    /api/config             - Update wiki settings
```

### File Format

#### Document Metadata (Front Matter)
```yaml
---
title: "Document Title"
created: 2025-01-15T10:30:00Z
modified: 2025-01-15T15:45:00Z
tags: [tag1, tag2]
aliases: [alternative-name]
---

# Document Content

Your markdown content here with [[wiki links]].
```

#### Configuration File
```json
{
  "siteName": "My Schist Wiki",
  "theme": "default",
  "features": {
    "graphView": true,
    "darkMode": true,
    "autoSave": true
  },
  "search": {
    "indexingEnabled": true,
    "stemming": false
  }
}
```

### Security Considerations

- Input sanitization for all user content
- File path validation to prevent directory traversal
- Content Security Policy headers
- Rate limiting for API endpoints
- Optional authentication for private wikis

## User Interface Design

### Layout Structure
```
+------------------+------------------+------------------+
|    Top Bar       |                  |                  |
| Logo | Search    |                  |                  |
+------------------+------------------+------------------+
|                  |                  |                  |
|   Sidebar        |   Main Editor    |   Preview        |
| - File Tree      | - Markdown Edit  | - Rendered HTML  |
| - Recent Pages   | - Toolbar        | - Table of Cont. |
| - Tags           |                  | - Backlinks      |
|                  |                  |                  |
+------------------+------------------+------------------+
|              Status Bar                                |
+-------------------------------------------------------|
```

### Key UI Components

2. **Header Bar**
   - Schist logo/name
   - Search box with live suggestions
   - Theme toggle
   - Settings menu

2. **Sidebar** (collapsible)
   - File tree with folder structure
   - Recently viewed documents
   - Tag cloud
   - Favorites list

3. **Editor Area**
   - Markdown editor with syntax highlighting
   - Toolbar with formatting options
   - Live word count
   - Auto-save indicator

4. **Preview Pane** (toggleable)
   - Rendered markdown
   - Table of contents
   - Backlinks section
   - Related documents

## Development Roadmap

### Phase 1: Foundation (4-6 weeks)
- [ ] Project setup and file structure
- [ ] Basic file operations (CRUD)
- [ ] Simple markdown editor
- [ ] File watching system
- [ ] Basic navigation

### Phase 2: Core Wiki Features (4-6 weeks)
- [ ] Wiki linking implementation
- [ ] Search functionality
- [ ] Responsive UI design
- [ ] Theme system
- [ ] Configuration management

### Phase 3: Polish & Enhancement (3-4 weeks)
- [ ] Graph view
- [ ] Advanced search
- [ ] Export functionality
- [ ] Mobile optimization
- [ ] Documentation

### Phase 4: Advanced Features (ongoing)
- [ ] Plugin system
- [ ] Git integration
- [ ] Collaboration features
- [ ] Performance optimization

## Success Metrics

- **Performance**: Document load time < 200ms
- **Usability**: Setup time < 5 minutes
- **Reliability**: 99%+ uptime for file operations
- **Portability**: Works on any system with Node.js
- **Simplicity**: Single command installation

## Competitive Analysis

| Feature | Schist | Wiki.js | BookStack | DokuWiki | Obsidian |
|---------|--------|---------|-----------|----------|----------|
| Database Required | ❌ | ✅ | ✅ | ❌ | ❌ |
| Pure Markdown | ✅ | ✅ | ✅ | ❌ | ✅ |
| Web-based | ✅ | ✅ | ✅ | ✅ | ❌ |
| Wiki Linking | ✅ | ✅ | ✅ | ✅ | ✅ |
| Graph View | ✅ | ❌ | ❌ | ❌ | ✅ |
| File-based | ✅ | ❌ | ❌ | ✅ | ✅ |
| Simplicity | ✅ | ❌ | ❌ | ✅ | ✅ |

## Technical Decisions

### Why Go?
- Excellent file system performance and native file operations
- Built-in HTTP server with great concurrency
- Easy deployment as a single binary
- Great ecosystem for text processing and search (Bleve)
- Perfect for self-hosted applications

### Why Gin vs Echo?
**Gin:**
- More popular, larger community
- Faster routing performance
- Better middleware ecosystem
- More examples and tutorials

**Echo:**
- Cleaner, more modern API design
- Better built-in middleware
- Smaller memory footprint
- More flexible routing

**Recommendation**: **Gin** chosen for rapid development, excellent community support, and proven performance in file-serving applications.

### Why Svelte 5?
- Minimal runtime overhead (perfect for self-hosted)
- Excellent developer experience
- Great TypeScript support
- Small bundle sizes
- SvelteKit provides SSR and file-based routing

### Why shadcn/ui?
- High-quality, accessible components
- Tailwind-native styling
- Copy-paste approach (no dependency bloat)
- Consistent design system
- Growing Svelte port available

### Project Structure
```
schist/
├── backend/
│   ├── cmd/
│   │   └── schist/
│   │       └── main.go
│   ├── internal/
│   │   ├── api/
│   │   ├── config/
│   │   ├── models/
│   │   ├── search/
│   │   └── watcher/
│   ├── pkg/
│   ├── go.mod
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   ├── routes/
│   │   └── app.html
│   ├── static/
│   ├── package.json
│   ├── svelte.config.js
│   ├── tailwind.config.js
│   └── Dockerfile
├── docker-compose.yml
├── docs/
└── README.md
```

## Risk Assessment

### Technical Risks
- **File system performance**: Mitigated by efficient indexing
- **Concurrent file access**: Handled with file locking
- **Search performance**: Solved with background indexing

### Product Risks
- **Feature creep**: Strict adherence to simplicity principle
- **User adoption**: Focus on developer/technical audience first
- **Maintenance burden**: Keep codebase small and focused

## Future Considerations

- Mobile app for reading/light editing
- Real-time collaborative editing
- Advanced plugin ecosystem
- Cloud hosting options
- Enterprise features (SSO, advanced permissions)
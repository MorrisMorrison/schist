# Schist MVP - Implementation Plan

## MVP Core Features (Must-Have)

The absolute minimum features needed for a functional markdown wiki that users can actually use.

### 1. File Operations (Foundation)
- **Create** new markdown pages
- **Read** existing markdown files
- **Update** page content
- **Delete** pages
- **List** all pages with basic metadata

### 2. Basic Editor
- Simple markdown editor with syntax highlighting
- Live preview pane (side-by-side or toggle)
- Auto-save functionality
- Basic toolbar (bold, italic, headers, links)

### 3. Wiki Linking (Core Differentiator)
- `[[Page Name]]` syntax support
- Automatic link resolution
- Basic backlink detection
- Simple broken link highlighting

### 4. Navigation
- File tree sidebar showing all pages
- Basic search (simple text matching)
- Recently viewed pages list

### 5. Basic UI
- Clean, responsive layout
- Dark/light theme toggle
- Mobile-friendly interface

## Build Order Priority

### Phase 1: Backend Foundation (Week 1-2)
**Goal**: Get basic file operations working with a simple API

1. **Project Setup**
   - Go module initialization
   - Gin server setup
   - Basic folder structure
   - Docker configuration

2. **Core Models & File Operations**
   ```go
   type Page struct {
       Slug     string    `json:"slug"`
       Title    string    `json:"title"`
       Content  string    `json:"content"`
       Created  time.Time `json:"created"`
       Modified time.Time `json:"modified"`
   }
   ```

3. **Basic API Endpoints**
   - `GET /api/pages` - List all pages
   - `GET /api/pages/:slug` - Get page content
   - `POST /api/pages` - Create new page
   - `PUT /api/pages/:slug` - Update page
   - `DELETE /api/pages/:slug` - Delete page

4. **File System Integration**
   - Read/write markdown files
   - Automatic slug generation from titles
   - Front matter parsing (title, dates, etc.)

**Milestone**: Can CRUD markdown files via API calls

### Phase 2: Frontend Foundation (Week 2-3)
**Goal**: Basic UI that can display and edit pages

1. **Svelte Setup**
   - SvelteKit project initialization
   - Tailwind CSS configuration
   - Basic routing setup

2. **Core Components**
   - PageList component (sidebar)
   - PageEditor component (markdown editor)
   - PageViewer component (rendered markdown)
   - Layout component (header, sidebar, main)

3. **Basic Editor Integration**
   - CodeMirror 6 setup
   - Markdown syntax highlighting
   - Simple toolbar

4. **API Integration**
   - Fetch pages from backend
   - Save/update functionality
   - Basic error handling

**Milestone**: Can view and edit pages through web interface

### Phase 3: Wiki Linking (Week 3-4)
**Goal**: Core wiki functionality with internal linking

1. **Link Parser (Backend)**
   - Parse `[[Page Name]]` syntax from markdown
   - Extract all links from page content
   - Generate backlinks data structure

2. **Link Resolver (Backend)**
   - Resolve wiki links to actual pages
   - Handle missing pages (broken links)
   - API endpoint for link data

3. **Link UI (Frontend)**
   - Clickable wiki links in preview
   - Broken link styling
   - Backlinks section in page view
   - Link suggestions in editor

**Milestone**: Full wiki linking functionality working

### Phase 4: Search & Navigation (Week 4-5)
**Goal**: Users can find and navigate content easily

1. **Simple Search (Backend)**
   - Text-based search across all pages
   - Search API endpoint
   - Basic relevance scoring

2. **Navigation UI (Frontend)**
   - Search box with live results
   - Recently viewed pages
   - Breadcrumb navigation
   - Quick page switcher (Ctrl+P)

**Milestone**: Complete MVP ready for initial users

## Technical Implementation Details

### Backend Structure
```
backend/
├── cmd/schist/main.go
├── internal/
│   ├── handlers/         # Gin route handlers
│   ├── models/          # Data structures
│   ├── services/        # Business logic
│   ├── parser/          # Markdown & link parsing
│   └── config/          # Configuration
├── pkg/
└── go.mod
```

### Frontend Structure
```
frontend/
├── src/
│   ├── lib/
│   │   ├── components/  # Reusable components
│   │   ├── stores/      # Svelte stores
│   │   └── api/         # API client
│   ├── routes/          # SvelteKit routes
│   └── app.html
├── static/
└── package.json
```

### Key Libraries

**Backend (Go)**
- `gin-gonic/gin` - Web framework
- `go-yaml/yaml` - Front matter parsing
- `gomarkdown/markdown` - Markdown processing
- `fsnotify/fsnotify` - File watching (Phase 2+)

**Frontend (Svelte)**
- `@codemirror/lang-markdown` - Editor
- `marked` - Markdown rendering
- `@tailwindcss/typography` - Styled markdown
- `lucide-svelte` - Icons

## MVP Success Criteria

### User Story: "I can create a personal wiki"
1. ✅ User can create new pages
2. ✅ User can edit pages with markdown
3. ✅ User can link pages together with `[[links]]`
4. ✅ User can navigate between linked pages
5. ✅ User can search for pages
6. ✅ User can see recently viewed pages

### Technical Criteria
- **Performance**: Page loads < 200ms
- **Reliability**: No data loss during editing
- **Usability**: Intuitive enough for non-technical users
- **Portability**: Runs with single Docker command

## Post-MVP Features (Phase 5+)

Features to add after MVP is stable and user-tested:

### Immediate Next (Phase 5)
- Graph view of page connections
- Better search with Bleve
- Export functionality (PDF, HTML)
- Page templates

### Medium Term (Phase 6)
- File attachments/images
- Tags system
- Advanced editor features
- Configuration UI

### Long Term (Phase 7+)
- Git integration
- Real-time collaboration
- Plugin system
- Mobile app

## Development Strategy

### Iteration Approach
1. **Build smallest possible version** of each feature
2. **Test with real usage** before adding complexity
3. **Get user feedback** early and often
4. **Refactor ruthlessly** when patterns emerge

### Testing Strategy
- **Manual testing** for MVP (automated tests for post-MVP)
- **Dogfood early** - use Schist to document Schist
- **Simple deployment** - Docker Compose for easy testing

### Documentation Strategy
- **README with quick start** (< 5 minutes to running)
- **API documentation** (auto-generated from code)
- **User guide** (built with Schist itself)

## Risk Mitigation

### Technical Risks
- **File corruption**: Implement atomic writes and backups
- **Performance**: Profile early, optimize file operations
- **Browser compatibility**: Test on major browsers

### Product Risks
- **Feature creep**: Stick to MVP list religiously
- **Over-engineering**: Prefer simple solutions
- **User adoption**: Focus on ease of setup and use

## Next Immediate Steps

1. **Create project repository** with proper Go module structure
2. **Set up basic Gin server** with health check endpoint
3. **Implement Page model** and basic file operations
4. **Create simple API endpoint** for listing pages
5. **Test with curl/Postman** before moving to frontend

Ready to start building? 🪨
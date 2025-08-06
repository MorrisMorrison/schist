# Schist Frontend 

## Architecture

The frontend is built with **SvelteKit** using **Svelte 5** with the new runes syntax. It's a server-side rendered (SSR) application with client-side hydration.

## Core Features

### 1. Markdown Editing & Rendering

**Editing Flow:**

- Uses **CodeMirror 6** for the markdown editor with syntax highlighting
- Real-time preview mode that renders markdown as you type
- Split-screen view with editor on left, preview on right
- Auto-save functionality and unsaved changes detection

**Rendering Flow:**

- Uses **marked** library to parse markdown to HTML
- Renders markdown content on page view routes
- Supports GitHub Flavored Markdown (GFM) features

**Key Components:**

- `Editor.svelte` - Main editor component with CodeMirror integration
- `MarkdownPreview.svelte` - Live preview rendering
- `EditorToolbar.svelte` - Formatting buttons and controls

### 2. Document Management

**Document Structure:**

- Each document has metadata (title, slug, tags, created/updated dates)
- Content is stored as raw markdown
- Slugs are auto-generated from titles but can be customized

**CRUD Operations:**

- **Create:** `/new` route with form for title and content
- **Read:** `/[slug]` route displays rendered markdown
- **Update:** `/edit/[slug]` route with full editor
- **Delete:** Via DocumentList component with confirmation dialogs

### 3. Theme System

**Implementation:**

- CSS custom properties for theme variables
- Light/dark mode toggle with system detection on first visit
- Persisted in localStorage
- Theme applied via CSS variables that update across all components

**Key Files:**

- `src/lib/stores/theme.ts` - Theme state management
- `src/app.css` - CSS custom properties definition
- `ThemeToggle.svelte` - Toggle button component

### 4. Navigation & Routing

**Route Structure:**

```
/                  - Home page with recent documents
/new               - Create new document
/edit/[slug]       - Edit existing document
/[slug]            - View document (catch-all route)
/documents         - List all documents with search/filter
/editor-test       - Development testing route
```

**Navigation Pattern:**

- Server-side routing with SvelteKit
- Dynamic imports for code splitting
- Client-side navigation after initial load

### 5. API Integration

**Backend Communication:**

- RESTful API calls to Go backend
- Custom API client in `src/lib/api/client.ts`
- Type definitions in `src/lib/api/types.ts`

**Key API Operations:**

- `GET /api/documents` - List all documents
- `GET /api/documents/:slug` - Get specific document
- `POST /api/documents` - Create new document
- `PUT /api/documents/:slug` - Update document
- `DELETE /api/documents/:slug` - Delete document

### 6. State Management

**Approach:**

- Svelte stores for global state (theme, API client)
- Component-local state using Svelte 5 runes (`$state`, `$derived`)
- No external state management library needed

**Key Stores:**

- `theme.ts` - Theme state and actions
- Reactive state patterns using `$state` and `$derived`

### 7. UI Components

**Component Architecture:**

- Custom shadcn/ui-style components for Svelte 5
- Reusable design system components
- Consistent styling with Tailwind CSS

**Key Components:**

- `DocumentList.svelte` - Displays paginated document lists
- `DocumentCard.svelte` - Individual document preview cards
- `ErrorAlert.svelte` - Error message display
- UI components in `src/lib/components/ui/`

### 8. Search & Filtering

**Implementation:**

- Client-side search through document metadata and content
- Real-time filtering as you type
- Multiple sort options (title, created, updated)
- Alphabetical grouping for better organization

**Features:**

- Search by title, slug, content, or tags
- Sort by title, creation date, or last updated
- Filter results update instantly

### 9. Responsive Design

**Approach:**

- Mobile-first responsive design
- Tailwind CSS for responsive utilities
- Adaptive layouts for different screen sizes
- Touch-friendly interfaces on mobile

### 10. Development Features

**Hot Reload:**

- Vite-powered development server
- Hot module replacement for fast development
- TypeScript support with proper type checking

**Code Quality:**

- ESLint and Prettier for code formatting
- TypeScript for type safety
- Svelte-specific linting rules

## File Structure

```
src/
├── lib/
│   ├── api/           # API client and types
│   ├── components/    # Reusable components
│   │   └── ui/       # Design system components
│   ├── stores/       # Global state management
│   └── utils.ts      # Utility functions
├── routes/           # SvelteKit routes
│   ├── [slug]/      # Dynamic document routes
│   ├── edit/        # Edit document routes
│   ├── new/         # New document route
│   └── documents/   # Document listing route
├── app.css          # Global styles and theme variables
├── app.html         # HTML template
└── app.js           # Application entry point
```
# Frontend Implementation Overview

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

### 2. Page Management

**Page Structure:**

- Each page has metadata (title, slug, tags, created/updated dates)
- Content is stored as raw markdown
- Slugs are auto-generated from titles but can be customized

**CRUD Operations:**

- **Create:** `/new` route with form for title and content
- **Read:** `/[slug]` route displays rendered markdown
- **Update:** `/edit/[slug]` route with full editor
- **Delete:** Via PageList component with confirmation dialogs

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
/                  - Home page with recent pages
/new               - Create new page
/edit/[slug]       - Edit existing page
/[slug]            - View page (catch-all route)
/pages             - List all pages with search/filter
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

- `GET /api/pages` - List all pages
- `GET /api/pages/:slug` - Get specific page
- `POST /api/pages` - Create new page
- `PUT /api/pages/:slug` - Update page
- `DELETE /api/pages/:slug` - Delete page

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

- `PageList.svelte` - Displays paginated page lists
- `PageCard.svelte` - Individual page preview cards
- `ErrorAlert.svelte` - Error message display
- UI components in `src/lib/components/ui/`

### 8. Search & Filtering

**Implementation:**

- Client-side search through page metadata and content
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

## Data Flow

### Page Creation Flow

1. User navigates to `/new`
2. Fills out form with title and content
3. Client submits POST request to API
4. Backend creates page with generated slug
5. User redirected to new page view

### Page Editing Flow

1. User navigates to `/edit/[slug]`
2. Page data loaded from API
3. CodeMirror editor initialized with content
4. User edits with live preview
5. Changes saved via PUT request to API
6. Success feedback and redirect to page view

### Theme Toggle Flow

1. User clicks theme toggle button
2. Theme store updated with new value
3. CSS custom properties updated
4. Theme persisted to localStorage
5. All components re-render with new theme

## Key Technical Decisions

### Why Svelte 5?

- Modern reactive system with runes
- Better TypeScript integration
- Smaller bundle sizes
- Simpler state management

### Why CodeMirror 6?

- Modern, extensible editor
- Great markdown support
- Theming capabilities
- Good performance

### Why CSS Custom Properties?

- Cleaner theme implementation
- Better performance than CSS-in-JS
- Easier maintenance
- Better browser support

### Why Server-Side Rendering?

- Better SEO for wiki content
- Faster initial page loads
- Progressive enhancement
- Better accessibility

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
│   ├── [slug]/      # Dynamic page routes
│   ├── edit/        # Edit page routes
│   ├── new/         # New page route
│   └── pages/       # Page listing route
├── app.css          # Global styles and theme variables
├── app.html         # HTML template
└── app.js           # Application entry point
```

This architecture provides a solid foundation for a wiki application with modern web technologies, good performance, and excellent developer experience.

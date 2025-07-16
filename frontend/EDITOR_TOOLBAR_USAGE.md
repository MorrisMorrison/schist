# Editor Toolbar Usage Guide

## Overview
The editor toolbar has been successfully integrated into your Schist wiki application. Both the "Edit Page" and "New Page" routes now use the full-featured `Editor` component with toolbar functionality.

## Features Available

### Toolbar Buttons
The toolbar provides the following formatting options:

- **Bold** (B) - `Ctrl+B` - Makes text bold: `**bold text**`
- **Italic** (I) - `Ctrl+I` - Makes text italic: `*italic text*`
- **Heading 1** (H1) - `Ctrl+1` - Creates level 1 heading: `# Heading 1`
- **Heading 2** (H2) - `Ctrl+2` - Creates level 2 heading: `## Heading 2`
- **Heading 3** (H3) - `Ctrl+3` - Creates level 3 heading: `### Heading 3`
- **Bullet List** (•) - Creates unordered list: `- List item`
- **Numbered List** (1.) - Creates ordered list: `1. List item`
- **Link** (🔗) - `Ctrl+K` - Creates link: `[link text](URL)`
- **Code** (</>) - `Ctrl+`` - Creates inline code: `` `code` ``
- **Quote** (") - Creates blockquote: `> Quote`
- **Theme Toggle** (🌙/☀️) - Switches between light and dark themes

### Additional Features

1. **Live Preview** - Side-by-side markdown editor and preview
2. **Auto-save** - Automatically saves content (configurable interval)
3. **Word/Character Count** - Shows statistics in the status bar
4. **Keyboard Shortcuts** - Full keyboard support for all formatting
5. **Dark/Light Theme** - Toggle between themes with toolbar button

## How to Use

### In Edit Mode (`/edit/[slug]`)
1. Navigate to any existing page
2. Click the "Edit" button or visit `/edit/[slug]`
3. The editor will load with:
   - Current page content
   - Auto-save enabled (saves every 10 seconds)
   - Full toolbar functionality
   - Live preview panel

### In New Page Mode (`/new`)
1. Click "New Page" or visit `/new`
2. The editor will load with:
   - Empty content (or pre-filled from URL params)
   - Auto-save disabled (manual save via Ctrl+S)
   - Full toolbar functionality
   - Live preview panel

### Keyboard Shortcuts
- `Ctrl+B` / `Cmd+B` - Bold
- `Ctrl+I` / `Cmd+I` - Italic
- `Ctrl+1` / `Cmd+1` - Heading 1
- `Ctrl+2` / `Cmd+2` - Heading 2
- `Ctrl+3` / `Cmd+3` - Heading 3
- `Ctrl+K` / `Cmd+K` - Link
- `Ctrl+`` / `Cmd+`` - Code
- `Ctrl+S` / `Cmd+S` - Save

### Theme Toggle
- Click the 🌙/☀️ button in the toolbar to switch themes
- Changes apply immediately to both editor and preview

## Component Structure

The editor is built from these components:
- `Editor.svelte` - Main editor component with CodeMirror integration
- `EditorToolbar.svelte` - Toolbar with formatting buttons
- `MarkdownPreview.svelte` - Live preview rendering

## Configuration Options

The Editor component accepts these props:
```typescript
interface EditorProps {
  initialContent?: string;     // Initial markdown content
  theme?: 'light' | 'dark';   // Editor theme
  onContentChange?: (content: string) => void;  // Content change callback
  onSave?: (content: string) => void;           // Save callback
  autoSave?: {                 // Auto-save configuration
    enabled: boolean;
    interval: number;          // Milliseconds
    onSave: (content: string) => void;
  };
  readonly?: boolean;          // Make editor read-only
}
```

## Next Steps

The toolbar is now fully functional! You can:
1. Start your dev server: `npm run dev`
2. Navigate to any page and click "Edit" to see the toolbar in action
3. Create a new page to test the toolbar functionality
4. Use keyboard shortcuts for faster editing
5. Toggle between themes to see the different styles

The editor provides a rich, user-friendly experience for creating and editing your wiki content.
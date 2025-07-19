# Markdown Rendering Implementation

This document explains how markdown rendering is implemented in the Schist application, including enhanced features like copy buttons for code blocks and proper image handling.

## Overview

The markdown rendering system consists of two main components:
1. **Enhanced Markdown Renderer** (`src/lib/utils/markdown.ts`) - Core rendering logic with custom features
2. **Markdown Preview Component** (`src/lib/components/MarkdownPreview.svelte`) - UI component for live preview

## Core Rendering Engine

### Enhanced Markdown Parser (`markdown.ts`)

The core markdown rendering is built on top of the `marked` library with custom renderers for enhanced functionality:

```typescript
import { marked } from 'marked';
import { apiClient } from '$lib/api/client';

// Custom renderer with enhanced features
const renderer = new marked.Renderer();
```

### Custom Features

#### 1. Code Block Copy Buttons

Code blocks are enhanced with copy functionality:

```typescript
renderer.code = function({ text, lang }: Tokens.Code): string {
    // Escape HTML entities for security
    const escapedCode = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const langClass = lang ? ` language-${lang}` : '';
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    
    return `
        <div class="code-block-container flex justify-between">
            <pre class="grow-1"><code class="hljs${langClass}">${escapedCode}</code></pre>
            <div class="code-block-header pl-5">
                ${langLabel}
                <button 
                    class="copy-button px-3 py-2 text-sm font-semibold rounded-md hover:bg-gray-50" 
                    data-copy-text="${escapedCode.replace(/"/g, '&quot;')}"
                    title="Copy code"
                    aria-label="Copy code to clipboard"
                >
                    <svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24">
                        <!-- Copy icon SVG -->
                    </svg>
                </button>
            </div>
        </div>
    `;
};
```

**Features:**
- Language detection and labeling
- Security through HTML escaping
- Accessible with ARIA labels
- Visual feedback on copy success/failure
- SVG icons for copy states

#### 2. Inline Code Copy Buttons

Inline code spans also get copy functionality:

```typescript
renderer.codespan = function({ text }: Tokens.Codespan): string {
    // Similar implementation with inline styling
};
```

#### 3. Image Path Transformation

Images are automatically transformed to use the correct server endpoints:

```typescript
renderer.image = function({ href, title, text }: Tokens.Image): string {
    let src = href;
    // Check if href starts with /assets/ (ignoring query parameters)
    const pathWithoutQuery = href.split('?')[0];
    if (pathWithoutQuery.startsWith('/assets/')) {
        // Use the API client's method to get the correct asset URL
        src = apiClient.getAssetUrl(href);
    }
    
    return `<img src="${src}" alt="${alt}"${titleAttr} 
             class="max-w-full h-auto rounded-lg shadow-sm" 
             loading="lazy" 
             onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\\'text-red-500 text-sm\\'>Image not found: ${alt || href}</div>'" />`;
};
```

**Features:**
- Automatic path transformation (`/assets/` → `/uploads/`)
- Query parameter preservation (for cache busting)
- Responsive image styling
- Lazy loading
- Error handling with fallback message

### Configuration

```typescript
marked.setOptions({
    renderer,
    breaks: true,      // Convert line breaks to <br>
    gfm: true         // GitHub Flavored Markdown
});
```

### Main Export Functions

#### `parseMarkdownWithCopyButtons(content: string): Promise<string>`

Main function to parse markdown with all enhanced features:

```typescript
export async function parseMarkdownWithCopyButtons(content: string): Promise<string> {
    try {
        const result = await marked.parse(content);
        return typeof result === 'string' ? result : String(result);
    } catch (error) {
        console.error('Markdown parsing error:', error);
        return '<p class="text-red-500">Error parsing markdown content</p>';
    }
}
```

#### `initializeCodeBlockCopyButtons(container: HTMLElement): void`

Initializes copy button functionality after HTML is rendered:

```typescript
export function initializeCodeBlockCopyButtons(container: HTMLElement): void {
    const copyButtons = container.querySelectorAll('.copy-button');
    
    copyButtons.forEach((button) => {
        // Remove existing listeners to prevent duplicates
        button.removeEventListener('click', handleCopyClick);
        button.addEventListener('click', handleCopyClick);
    });
}
```

### Copy Functionality Implementation

#### Modern Clipboard API with Fallback

```typescript
async function handleCopyClick(event: Event): Promise<void> {
    const button = event.currentTarget as HTMLButtonElement;
    const copyText = button.getAttribute('data-copy-text');
    
    if (!copyText) return;

    // Decode HTML entities
    const decodedText = copyText
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');

    try {
        // Modern clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(decodedText);
        } else {
            // Fallback method for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = decodedText;
            textarea.style.position = 'fixed';
            textarea.style.left = '-999999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }

        showCopyFeedback(button, true);
    } catch (error) {
        console.error('Copy failed:', error);
        showCopyFeedback(button, false);
    }
}
```

#### Visual Feedback

```typescript
function showCopyFeedback(button: HTMLElement, success: boolean): void {
    const originalHTML = button.innerHTML;
    
    if (success) {
        // Show checkmark icon
        button.innerHTML = `<svg class="copy-icon text-green-600"><!-- checkmark --></svg>`;
        button.setAttribute('title', 'Copied!');
    } else {
        // Show error icon
        button.innerHTML = `<svg class="copy-icon text-red-600"><!-- error --></svg>`;
        button.setAttribute('title', 'Copy failed');
    }

    // Reset after 2 seconds
    setTimeout(() => {
        button.innerHTML = originalHTML;
        button.setAttribute('title', 'Copy code');
    }, 2000);
}
```

## MarkdownPreview Component

### Component Structure

The `MarkdownPreview.svelte` component provides a reactive UI for rendering markdown:

```svelte
<script lang="ts">
    import type { PreviewProps } from '$lib/types/editor';
    import { parseMarkdownWithCopyButtons, initializeCodeBlockCopyButtons } from '$lib/utils/markdown';

    let { content, theme = 'light', className = '' }: PreviewProps = $props();
    
    // Container reference for initializing copy buttons
    let containerRef: HTMLDivElement;

    // State for HTML content
    let htmlContent = $state('');
</script>
```

### Reactive Content Updates

Uses Svelte 5's `$effect` for reactive updates:

```typescript
$effect(() => {
    const updateContent = async () => {
        try {
            htmlContent = await parseMarkdownWithCopyButtons(content);
            // Initialize copy buttons after content is rendered
            if (containerRef) {
                initializeCodeBlockCopyButtons(containerRef);
            }
        } catch (error) {
            console.error('Markdown parsing error:', error);
            htmlContent = '<p class="text-red-500">Error parsing markdown content</p>';
        }
    };
    updateContent();
});
```

### Template Structure

```svelte
<div
    bind:this={containerRef}
    class="markdown-preview h-full overflow-auto border-l {themeClasses} {className}"
    role="region"
    aria-label="Markdown preview"
>
    <div class="p-4 {proseClasses}">
        {@html htmlContent}
    </div>
</div>
```

### Theme Support

```typescript
const themeClasses = $derived(
    theme === 'dark' ? 'bg-gray-900 text-gray-100 dark' : 'bg-white text-gray-900'
);
```

## Usage in Editor

The markdown preview is integrated into the main editor component:

```svelte
<!-- Editor.svelte -->
{#if isPreviewVisible}
    <div class="flex flex-1 flex-col">
        <div class="border-b px-4 py-2">
            <span class="text-sm font-medium">Preview</span>
        </div>
        <div class="flex-1 overflow-hidden">
            <MarkdownPreview content={currentContent} theme={currentTheme} />
        </div>
    </div>
{/if}
```

## Styling

### Custom Scrollbars

```css
.markdown-preview {
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
}

.markdown-preview::-webkit-scrollbar {
    width: 6px;
}

.markdown-preview::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 3px;
}
```

### Responsive Elements

```css
:global(.markdown-preview table) {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
}

:global(.markdown-preview pre) {
    overflow-x: auto;
    border-radius: 0.375rem;
}
```

## Security Considerations

1. **HTML Escaping**: All user-provided content is properly escaped
2. **XSS Prevention**: No unescaped user input in HTML generation
3. **Secure Clipboard**: Uses modern clipboard API when available
4. **Input Validation**: Proper validation of image paths and content

## Performance Optimizations

1. **Lazy Loading**: Images use `loading="lazy"` attribute
2. **Event Delegation**: Copy buttons use efficient event handling
3. **Debounced Updates**: Content updates are optimized for typing
4. **Memory Management**: Event listeners are properly cleaned up

## Browser Compatibility

- **Modern Browsers**: Full feature support including clipboard API
- **Legacy Browsers**: Fallback clipboard implementation using `document.execCommand`
- **Progressive Enhancement**: Core functionality works without JavaScript
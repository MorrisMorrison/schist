<script lang="ts">
	import { marked } from 'marked';
	import type { PreviewProps } from '$lib/types/editor';
	import type { Tokens } from 'marked';
	import { PUBLIC_API_URL } from '$env/static/public';

	let { content, theme = 'light', className = '' }: PreviewProps = $props();
	
	// Get base server URL from API URL
	const serverBaseUrl = PUBLIC_API_URL ? PUBLIC_API_URL.replace('/api', '') : 'http://localhost:8080';

	// Create a renderer for image path handling
	const renderer = new marked.Renderer();
	
	// Override image rendering to handle local asset paths
	renderer.image = function({ href, title, text }: Tokens.Image): string {
		// Convert local asset paths to full URLs
		let src = href;
		// Check if href starts with /assets/ (ignoring query parameters)
		const pathWithoutQuery = href.split('?')[0];
		if (pathWithoutQuery.startsWith('/assets/')) {
			// Transform /assets/ to /uploads/ for user-uploaded content
			const uploadsPath = href.replace('/assets/', '/uploads/');
			src = `${serverBaseUrl}${uploadsPath}`;
		}
		
		const titleAttr = title ? ` title="${title}"` : '';
		const alt = text || '';
		
		return `<img src="${src}" alt="${alt}"${titleAttr} class="max-w-full h-auto rounded-lg shadow-sm" loading="lazy" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\\'text-red-500 text-sm\\'>Image not found: ${alt || href}</div>'" />`;
	};

	// Configure marked for security and performance
	marked.setOptions({
		renderer,
		breaks: true,
		gfm: true
	});

	// Reactive HTML generation
	let htmlContent = $derived(
		(() => {
			try {
				return marked.parse(content);
			} catch (error) {
				console.error('Markdown parsing error:', error);
				return '<p class="text-red-500">Error parsing markdown content</p>';
			}
		})()
	);

	// Theme classes
	const themeClasses = $derived(
		theme === 'dark' ? 'bg-gray-900 text-gray-100 dark' : 'bg-white text-gray-900'
	);

	// Base prose classes for markdown styling
	const proseClasses = 'prose max-w-none';
</script>

<div
	class="markdown-preview h-full overflow-auto border-l {themeClasses} {className}"
	role="region"
	aria-label="Markdown preview"
>
	<div class="p-4 {proseClasses}">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html htmlContent}
	</div>
</div>

<style>
	.markdown-preview {
		/* Custom scrollbar for preview */
		scrollbar-width: thin;
		scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
	}

	.markdown-preview::-webkit-scrollbar {
		width: 6px;
	}

	.markdown-preview::-webkit-scrollbar-track {
		background: transparent;
	}

	.markdown-preview::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 3px;
	}

	.markdown-preview::-webkit-scrollbar-thumb:hover {
		background-color: rgba(156, 163, 175, 0.7);
	}

	/* Ensure tables are responsive */
	:global(.markdown-preview table) {
		display: block;
		overflow-x: auto;
		white-space: nowrap;
	}

	/* Improve code block styling */
	:global(.markdown-preview pre) {
		overflow-x: auto;
		border-radius: 0.375rem;
	}

	/* Improve blockquote styling */
	:global(.markdown-preview blockquote) {
		border-left: 4px solid;
		padding-left: 1rem;
		margin: 1rem 0;
	}

	/* Task list styling */
	:global(.markdown-preview ul li input[type='checkbox']) {
		margin-right: 0.5rem;
	}
</style>

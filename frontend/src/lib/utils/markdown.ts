import { marked } from 'marked';
import type { Tokens } from 'marked';
import { apiClient } from '$lib/api/client';
import hljs from 'highlight.js/lib/core';

// Import commonly used languages
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import shell from 'highlight.js/lib/languages/shell';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import nginx from 'highlight.js/lib/languages/nginx';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('go', go);
hljs.registerLanguage('golang', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('bash', shell);
hljs.registerLanguage('sh', shell);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('nginx', nginx);

/**
 * Enhanced markdown renderer with copy buttons for code blocks
 */

// Custom renderer for code blocks and images
const renderer = new marked.Renderer();

// Override image rendering to handle local asset paths
renderer.image = function ({ href, title, text }: Tokens.Image): string {
	// Convert local asset paths to full URLs
	let src = href;
	// Check if href starts with /assets/ (ignoring query parameters)
	const pathWithoutQuery = href.split('?')[0];
	if (pathWithoutQuery.startsWith('/assets/')) {
		// Use the API client's method to get the correct asset URL
		src = apiClient.getAssetUrl(href);
	}

	const titleAttr = title ? ` title="${title}"` : '';
	const alt = text || '';

	return `<img src="${src}" alt="${alt}"${titleAttr} class="max-w-full h-auto rounded-lg shadow-sm" loading="lazy" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\\'text-red-500 text-sm\\'>Image not found: ${alt || href}</div>'" />`;
};

// Override code block rendering to add syntax highlighting and copy functionality
renderer.code = function ({ text, lang }: Tokens.Code): string {
	// Apply syntax highlighting if language is specified and supported
	let highlightedCode = text;
	if (lang && hljs.getLanguage(lang)) {
		try {
			const result = hljs.highlight(text, { language: lang });
			highlightedCode = result.value;
		} catch (error) {
			console.warn(`Failed to highlight code for language "${lang}":`, error);
			// Fall back to escaped plain text
			highlightedCode = text
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}
	} else {
		// No language specified or not supported, escape HTML
		highlightedCode = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	// Prepare escaped version for copy functionality
	const escapedForCopy = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

	const langClass = lang ? ` language-${lang}` : '';
	const langLabel = lang
		? `<span class="code-lang text-xs text-muted-foreground bg-muted px-2 py-1 rounded">${lang}</span>`
		: '';

	return `
		<div class="code-block-container relative group border rounded-lg bg-muted/30 my-4">
			<div class="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
				${langLabel}
				<button 
					class="copy-button px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors opacity-0 group-hover:opacity-100" 
					data-copy-text="${escapedForCopy.replace(/"/g, '&quot;')}"
					title="Copy code"
					aria-label="Copy code to clipboard"
				>
					<svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
					</svg>
				</button>
			</div>
			<pre class="overflow-x-auto p-4 text-sm leading-relaxed"><code class="hljs${langClass}">${highlightedCode}</code></pre>
		</div>
	`;
};

// Override inline code rendering - simpler without copy button for inline code
renderer.codespan = function ({ text }: Tokens.Codespan): string {
	const escapedCode = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

	return `<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">${escapedCode}</code>`;
};

// Configure marked options
marked.setOptions({
	renderer,
	breaks: true,
	gfm: true
});

/**
 * Parse markdown with enhanced code block functionality
 */
export async function parseMarkdownWithCopyButtons(content: string): Promise<string> {
	try {
		const result = await marked.parse(content);
		return typeof result === 'string' ? result : String(result);
	} catch (error) {
		console.error('Markdown parsing error:', error);
		return '<p class="text-red-500">Error parsing markdown content</p>';
	}
}

/**
 * Initialize copy button functionality for rendered code blocks
 * Call this after the HTML is inserted into the DOM
 */
export function initializeCodeBlockCopyButtons(container: HTMLElement): void {
	const copyButtons = container.querySelectorAll('.copy-button');

	copyButtons.forEach((button) => {
		// Remove existing listeners to prevent duplicates
		button.removeEventListener('click', handleCopyClick);
		button.addEventListener('click', handleCopyClick);
	});
}

/**
 * Handle copy button click
 */
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
			// Fallback method
			const textarea = document.createElement('textarea');
			textarea.value = decodedText;
			textarea.style.position = 'fixed';
			textarea.style.left = '-999999px';
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
		}

		// Visual feedback
		showCopyFeedback(button, true);
	} catch (error) {
		console.error('Copy failed:', error);
		showCopyFeedback(button, false);
	}
}

/**
 * Show visual feedback for copy operation
 */
function showCopyFeedback(button: HTMLElement, success: boolean): void {
	const originalHTML = button.innerHTML;

	if (success) {
		button.innerHTML = `
			<svg class="copy-icon text-green-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="20,6 9,17 4,12"></polyline>
			</svg>
		`;
		button.setAttribute('title', 'Copied!');
	} else {
		button.innerHTML = `
			<svg class="copy-icon text-red-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="10"></circle>
				<line x1="12" y1="8" x2="12" y2="12"></line>
				<line x1="12" y1="16" x2="12.01" y2="16"></line>
			</svg>
		`;
		button.setAttribute('title', 'Copy failed');
	}

	// Reset after 2 seconds
	setTimeout(() => {
		button.innerHTML = originalHTML;
		button.setAttribute('title', 'Copy code');
	}, 2000);
}

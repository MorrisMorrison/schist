import { marked  } from 'marked';
import type {Tokens}  from 'marked';
import { apiClient } from '$lib/api/client';

/**
 * Enhanced markdown renderer with copy buttons for code blocks
 */

// Custom renderer for code blocks and images
const renderer = new marked.Renderer();

// Override image rendering to handle local asset paths
renderer.image = function({ href, title, text }: Tokens.Image): string {
	// Convert local asset paths to full URLs
	let src = href;
	// Check if href starts with /assets/ (ignoring query parameters)
	const pathWithoutQuery = href.split('?')[0];
	console.log('Image renderer debug:', { href, pathWithoutQuery, startsWithAssets: pathWithoutQuery.startsWith('/assets/') });
	if (pathWithoutQuery.startsWith('/assets/')) {
		// Use the API client's method to get the correct asset URL
		src = apiClient.getAssetUrl(href);
		console.log('Transformed URL:', src);
	}
	console.log('Final src:', src);
	
	const titleAttr = title ? ` title="${title}"` : '';
	const alt = text || '';
	
	return `<img src="${src}" alt="${alt}"${titleAttr} class="max-w-full h-auto rounded-lg shadow-sm" loading="lazy" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\\'text-red-500 text-sm\\'>Image not found: ${alt || href}</div>'" />`;
};

// Override code block rendering to add copy functionality
renderer.code = function({ text, lang }: Tokens.Code): string {
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
					class="copy-button px-3 py-2 text-sm font-semibold rounded-md hover:bg-gray-50  " 
					data-copy-text="${escapedCode.replace(/"/g, '&quot;')}"
					title="Copy code"
					aria-label="Copy code to clipboard"
				>
					<svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
					</svg>
				</button>
			</div>
		</div>
	`;
};

// Override inline code rendering  
renderer.codespan = function({ text }: Tokens.Codespan): string {
	const escapedCode = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

	return `
		<div class="flex justify-between rounded-md">
			<code class="inline-code">${escapedCode}</code>
			<div class="code-block-header">
				<button 
					class="copy-button px-3 py-1 text-sm font-semibold rounded-md hover:bg-gray-50 " 
					data-copy-text="${escapedCode.replace(/"/g, '&quot;')}"
					title="Copy code"
					aria-label="Copy code to clipboard"
				>
					<svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
					</svg>
				</button>
			</div>
		</div>
	`;
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
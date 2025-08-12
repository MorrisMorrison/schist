import { marked } from 'marked';
import type { Tokens } from 'marked';
import { apiClient } from '$lib/api/client';
import { highlightCode } from './markdown-config';

const renderer = new marked.Renderer();

function parseSizeToClass(size: string): string {
	const sizeMap: Record<string, string> = {
		small: 'max-w-[33%]',
		medium: 'max-w-[50%]',
		large: 'max-w-[75%]',
		full: 'max-w-full'
	};

	if (sizeMap[size]) return sizeMap[size];
	if (size.includes('%') || size.includes('px')) {
		return `max-w-[${size}]`;
	}
	if (/^\d+$/.test(size)) {
		return `max-w-[${size}px]`;
	}

	return 'max-w-[75%]';
}

renderer.image = function ({ href, title, text }: Tokens.Image): string {
	let src = href;
	const alt = text || '';
	let sizeClass = 'max-w-[75%]';
	let actualTitle = title || '';

	if (title && title.includes('|')) {
		const [titlePart, sizePart] = title.split('|', 2);
		actualTitle = titlePart;
		sizeClass = parseSizeToClass(sizePart);
	}

	const pathWithoutQuery = href.split('?')[0];
	if (pathWithoutQuery.startsWith('/assets/')) {
		src = apiClient.getAssetUrl(href);
	}

	function escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	const escapedSrc = escapeHtml(src);
	const escapedAlt = escapeHtml(alt);
	const escapedTitle = actualTitle ? ` title="${escapeHtml(actualTitle)}"` : '';
	const escapedOriginalSrc = escapeHtml(src);
	const escapedFallbackText = escapeHtml(alt || href);

	return `<img src="${escapedSrc}" alt="${escapedAlt}"${escapedTitle} class="${sizeClass} h-auto rounded-lg shadow-sm cursor-pointer hover:opacity-90 transition-opacity" loading="lazy" data-lightbox="true" data-original-src="${escapedOriginalSrc}" data-fallback-text="${escapedFallbackText}" />`;
};

renderer.code = function ({ text, lang }: Tokens.Code): string {
	const highlightedCode = highlightCode(text, lang || undefined);

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
					class="copy-button px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors" 
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

renderer.codespan = function ({ text }: Tokens.Codespan): string {
	const escapedCode = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

	return `<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">${escapedCode}</code>`;
};

marked.setOptions({
	renderer,
	breaks: true,
	gfm: true
});

export { marked as configuredMarked };

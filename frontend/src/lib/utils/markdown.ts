import { marked } from 'marked';
import type { Tokens } from 'marked';
import { apiClient } from '$lib/api/client';
import hljs from 'highlight.js/lib/core';
import { goto } from '$app/navigation';

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

interface WikiLink {
	target: string;
	displayText: string;
	path: string;
}

function generateSlug(title: string): string {
	return title
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^\w-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

async function resolveWikiLink(target: string): Promise<WikiLink> {
	try {
		const documents = await apiClient.getDocuments();

		const matchingDocument = documents.find(
			(document: { metaData?: { title?: string; path?: string } }) =>
				document.metaData?.title?.toLowerCase() === target.toLowerCase()
		);

		if (matchingDocument && matchingDocument.metaData?.path) {
			return {
				target,
				displayText: target,
				path: matchingDocument.metaData.path
			};
		}
	} catch (error) {
		console.warn('Failed to fetch documents for wiki link resolution:', error);
	}

	const slug = generateSlug(target);
	return {
		target,
		displayText: target,
		path: `/${slug}`
	};
}

function preprocessWikiLinks(content: string): string {
	const wikiLinks: Array<{ placeholder: string; target: string; displayText: string }> = [];
	let linkIndex = 0;

	const processed = content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, display) => {
		const placeholder = `<!--WIKI_LINK_${linkIndex}-->`;
		wikiLinks.push({
			placeholder,
			target: target.trim(),
			displayText: display ? display.trim() : target.trim()
		});
		linkIndex++;
		return placeholder;
	});

	const sessionId = `wikiLinks_${Date.now()}_${Math.random()}`;
	(globalThis as Record<string, unknown>)[sessionId] = wikiLinks;

	const processedWithSession = `${processed}\n<!-- WIKI_SESSION:${sessionId} -->`;

	return processedWithSession;
}

async function postprocessWikiLinks(html: string): Promise<string> {
	const sessionMatch = html.match(/<!-- WIKI_SESSION:([^-]+) -->/);
	if (!sessionMatch) {
		return html;
	}

	const sessionId = sessionMatch[1];
	const wikiLinks =
		((globalThis as Record<string, unknown>)[sessionId] as Array<{
			placeholder: string;
			target: string;
			displayText: string;
		}>) || [];

	if (wikiLinks.length === 0) {
		return html.replace(/\n<!-- WIKI_SESSION:[^-]+ -->/, '');
	}

	let processedHtml = html;

	for (const link of wikiLinks) {
		try {
			const resolvedLink = await resolveWikiLink(link.target);

			let linkClass = 'wiki-link text-blue-600 hover:text-blue-800 hover:underline cursor-pointer';
			let title = `Go to ${resolvedLink.target}`;

			try {
				await apiClient.getDocumentByPath(resolvedLink.path);
			} catch {
				linkClass =
					'wiki-link broken-link text-red-500 hover:text-red-700 hover:underline cursor-pointer';
				title = `Document "${resolvedLink.target}" does not exist (click to create)`;
			}

			const linkHtml = `<span class="${linkClass}" data-wiki-target="${resolvedLink.path}" title="${title}">${link.displayText}</span>`;

			processedHtml = processedHtml.split(link.placeholder).join(linkHtml);
		} catch (error) {
			console.error('Failed to process wiki link:', error);
			const linkHtml = `<span class="wiki-link broken-link text-red-500 hover:text-red-700 hover:underline cursor-pointer" data-wiki-target="/${generateSlug(link.target)}" title="Failed to resolve link">${link.displayText}</span>`;
			processedHtml = processedHtml.split(link.placeholder).join(linkHtml);
		}
	}

	delete (globalThis as Record<string, unknown>)[sessionId];
	processedHtml = processedHtml.replace(/\n<!-- WIKI_SESSION:[^-]+ -->/, '');

	return processedHtml;
}

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
	let highlightedCode = text;
	if (lang && hljs.getLanguage(lang)) {
		try {
			const result = hljs.highlight(text, { language: lang });
			highlightedCode = result.value;
		} catch (error) {
			console.warn(`Failed to highlight code for language "${lang}":`, error);
			highlightedCode = text
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}
	} else {
		highlightedCode = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

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

export async function parseMarkdownWithCopyButtons(content: string): Promise<string> {
	try {
		const preprocessedContent = preprocessWikiLinks(content);

		const result = await marked.parse(preprocessedContent);
		const htmlString = typeof result === 'string' ? result : String(result);

		const finalHtml = await postprocessWikiLinks(htmlString);

		setTimeout(() => {
			setupImageLightboxHandlers();
		}, 0);

		return finalHtml;
	} catch (error) {
		console.error('Markdown parsing error:', error);
		return '<p class="text-red-500">Error parsing markdown content</p>';
	}
}

function setupImageLightboxHandlers(): void {
	if (typeof document !== 'undefined') {
		document.removeEventListener('click', handleImageClick);
		document.removeEventListener('error', handleImageError, true);
		document.addEventListener('click', handleImageClick, { passive: false });
		document.addEventListener('error', handleImageError, true);
	}
}

function handleImageClick(event: Event): void {
	const target = event.target as HTMLElement;
	if (target.tagName === 'IMG' && target.hasAttribute('data-lightbox')) {
		event.preventDefault();
		const src = target.getAttribute('data-original-src') || target.getAttribute('src');
		const alt = target.getAttribute('alt') || '';

		if (src && typeof window !== 'undefined' && 'openImageLightbox' in window) {
			(window as { openImageLightbox: (src: string, alt: string) => void }).openImageLightbox(
				src,
				alt
			);
		}
	}
}

function handleImageError(event: Event): void {
	const target = event.target as HTMLImageElement;
	if (target.tagName === 'IMG' && target.hasAttribute('data-fallback-text')) {
		const fallbackText = target.getAttribute('data-fallback-text') || 'Image not found';
		const fallbackDiv = document.createElement('div');
		fallbackDiv.className = 'text-red-500 text-sm';
		fallbackDiv.textContent = `Image not found: ${fallbackText}`;

		target.style.display = 'none';
		target.parentNode?.insertBefore(fallbackDiv, target.nextSibling);
	}
}

export function initializeMarkdownInteractions(container: HTMLElement): void {
	const copyButtons = container.querySelectorAll('.copy-button');
	const wikiLinks = container.querySelectorAll('.wiki-link');

	copyButtons.forEach((button) => {
		button.removeEventListener('click', handleCopyClick);
		button.addEventListener('click', handleCopyClick);
	});

	wikiLinks.forEach((link) => {
		link.removeEventListener('click', handleWikiLinkClick);
		link.addEventListener('click', handleWikiLinkClick);
	});
}

function handleWikiLinkClick(event: Event): void {
	event.preventDefault();

	const linkElement = event.currentTarget as HTMLElement;
	const targetPath = linkElement.getAttribute('data-wiki-target');

	if (!targetPath) return;

	const isBrokenLink = linkElement.classList.contains('broken-link');

	if (isBrokenLink) {
		goto(`/edit${targetPath}`);
	} else {
		goto(`/documents${targetPath}`);
	}
}

async function handleCopyClick(event: Event): Promise<void> {
	event.preventDefault();
	event.stopPropagation();

	const button = event.currentTarget as HTMLButtonElement;
	const copyText = button.getAttribute('data-copy-text');

	if (!copyText) return;

	const decodedText = copyText
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');

	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(decodedText);
		} else {
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

function showCopyFeedback(button: HTMLElement, success: boolean): void {
	const originalContent = button.cloneNode(true) as HTMLElement;

	button.innerHTML = '';

	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('class', `copy-icon ${success ? 'text-green-600' : 'text-red-600'}`);
	svg.setAttribute('width', '16');
	svg.setAttribute('height', '16');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '2');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');

	if (success) {
		const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
		polyline.setAttribute('points', '20,6 9,17 4,12');
		svg.appendChild(polyline);
		button.setAttribute('title', 'Copied!');
	} else {
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', '12');
		circle.setAttribute('cy', '12');
		circle.setAttribute('r', '10');
		svg.appendChild(circle);

		const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		line1.setAttribute('x1', '12');
		line1.setAttribute('y1', '8');
		line1.setAttribute('x2', '12');
		line1.setAttribute('y2', '12');
		svg.appendChild(line1);

		const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		line2.setAttribute('x1', '12');
		line2.setAttribute('y1', '16');
		line2.setAttribute('x2', '12.01');
		line2.setAttribute('y2', '16');
		svg.appendChild(line2);

		button.setAttribute('title', 'Copy failed');
	}

	button.appendChild(svg);

	setTimeout(() => {
		button.innerHTML = '';
		button.appendChild(originalContent);
		button.setAttribute('title', 'Copy code');
	}, 2000);
}

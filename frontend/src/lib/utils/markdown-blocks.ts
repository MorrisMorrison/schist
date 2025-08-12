import { marked } from 'marked';
import type { Tokens } from 'marked';
import { configuredMarked } from './markdown';
import { highlightCode } from './markdown-config';
import { apiClient } from '$lib/api/client';
import { generateSlug } from '$lib/utils/path';
import { goto } from '$app/navigation';
export interface BaseBlock {
	type: string;
	id: string;
}

export interface HeadingBlock extends BaseBlock {
	type: 'heading';
	level: 1 | 2 | 3 | 4 | 5 | 6;
	text: string;
	raw: string;
}

export interface ParagraphBlock extends BaseBlock {
	type: 'paragraph';
	text: string;
	raw: string;
}

export interface CodeBlock extends BaseBlock {
	type: 'code';
	code: string;
	language?: string;
	highlighted: string;
	raw: string;
}

export interface ListBlock extends BaseBlock {
	type: 'list';
	ordered: boolean;
	items: ListItemBlock[];
	raw: string;
}

export interface ListItemBlock extends BaseBlock {
	type: 'list_item';
	text: string;
	raw: string;
}

export interface BlockquoteBlock extends BaseBlock {
	type: 'blockquote';
	text: string;
	raw: string;
}

export interface TableBlock extends BaseBlock {
	type: 'table';
	header: string[];
	rows: string[][];
	align: ('left' | 'right' | 'center' | null)[];
	raw: string;
}

export interface HtmlBlock extends BaseBlock {
	type: 'html';
	html: string;
	raw: string;
}

export interface HrBlock extends BaseBlock {
	type: 'hr';
	raw: string;
}

export interface ImageBlock extends BaseBlock {
	type: 'image';
	href: string;
	title?: string;
	text: string;
	size?: string;
	raw: string;
}

export interface WikiLinkBlock extends BaseBlock {
	type: 'wiki_link';
	target: string;
	displayText: string;
	path: string;
	exists: boolean;
	raw: string;
}

export type MarkdownBlock =
	| HeadingBlock
	| ParagraphBlock
	| CodeBlock
	| ListBlock
	| ListItemBlock
	| BlockquoteBlock
	| TableBlock
	| HtmlBlock
	| HrBlock
	| ImageBlock
	| WikiLinkBlock;
let blockIdCounter = 0;
function generateBlockId(): string {
	return `block-${Date.now()}-${++blockIdCounter}`;
}
export async function parseMarkdownToBlocks(content: string): Promise<MarkdownBlock[]> {
	const processedContent = preprocessWikiLinks(content);
	const sessionId = extractSessionId(processedContent);

	try {
		const tokens = marked.lexer(processedContent);
		const blocks: MarkdownBlock[] = [];

		for (const token of tokens) {
			const block = await convertTokenToBlock(token);
			if (block) {
				blocks.push(block);
			}
		}

		await postprocessAllWikiLinks(blocks, processedContent);

		return blocks;
	} finally {
		// Always cleanup session, even if processing fails
		if (sessionId) {
			cleanupSession(sessionId);
		}
	}
}

async function postprocessAllWikiLinks(
	blocks: MarkdownBlock[],
	originalContent: string
): Promise<void> {
	const sessionId = extractSessionId(originalContent);
	if (!sessionId) return;

	const wikiLinks = getWikiLinksFromSession(sessionId);
	if (wikiLinks.length === 0) return;

	for (const link of wikiLinks) {
		await processWikiLink(link, blocks);
	}

	// Note: Session cleanup is now handled in parseMarkdownToBlocks finally block
}

function extractSessionId(content: string): string | null {
	const sessionMatch = content.match(/<!-- WIKI_SESSION:([^-]+) -->/);
	return sessionMatch?.[1] || null;
}

function getWikiLinksFromSession(sessionId: string): Array<{
	placeholder: string;
	target: string;
	displayText: string;
}> {
	return (
		((globalThis as Record<string, unknown>)[sessionId] as Array<{
			placeholder: string;
			target: string;
			displayText: string;
		}>) || []
	);
}

async function processWikiLink(
	link: { placeholder: string; target: string; displayText: string },
	blocks: MarkdownBlock[]
): Promise<void> {
	try {
		const linkHtml = await createWikiLinkHtml(link);
		replaceWikiLinkInBlocks(link.placeholder, linkHtml, blocks);
	} catch (error) {
		console.warn(`Failed to resolve wiki link "${link.target}":`, error);
		const fallbackHtml = createBrokenLinkHtml(link);
		replaceWikiLinkInBlocks(link.placeholder, fallbackHtml, blocks);
	}
}

async function createWikiLinkHtml(link: { target: string; displayText: string }): Promise<string> {
	const resolvedLink = await resolveWikiLink(link.target);
	let linkClass = 'wiki-link text-blue-600 hover:text-blue-800 hover:underline cursor-pointer';
	let title = `Go to ${resolvedLink.target}`;

	try {
		await apiClient.getDocumentByPath(resolvedLink.path);
	} catch (_error) {
		linkClass = 'wiki-link broken-link text-red-500 cursor-default';
		title = `Document "${resolvedLink.target}" does not exist`;
	}

	return `<span class="${linkClass}" data-wiki-target="${resolvedLink.path}" title="${title}">${link.displayText}</span>`;
}

function createBrokenLinkHtml(link: { target: string; displayText: string }): string {
	const slug = generateSlug(link.target);
	return `<span class="wiki-link broken-link text-red-500 cursor-default" data-wiki-target="/${slug}" title="Failed to resolve link">${link.displayText}</span>`;
}

function replaceWikiLinkInBlocks(
	placeholder: string,
	linkHtml: string,
	blocks: MarkdownBlock[]
): void {
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		if (block.type === 'paragraph') {
			const paragraphBlock = block as ParagraphBlock;
			if (paragraphBlock.text.includes(placeholder)) {
				const newText = paragraphBlock.text.split(placeholder).join(linkHtml);
				blocks[i] = {
					...paragraphBlock,
					text: newText
				};
			}
		}
	}
}

function cleanupSession(sessionId: string): void {
	delete (globalThis as Record<string, unknown>)[sessionId];
}

async function convertTokenToBlock(token: Tokens.Generic): Promise<MarkdownBlock | null> {
	const id = generateBlockId();

	switch (token.type) {
		case 'heading': {
			const headingToken = token as Tokens.Heading;
			let text = headingToken.text;

			text = await processInlineMarkdown(text);

			return {
				type: 'heading',
				id,
				level: headingToken.depth as 1 | 2 | 3 | 4 | 5 | 6,
				text,
				raw: headingToken.raw
			} as HeadingBlock;
		}

		case 'paragraph': {
			const paragraphToken = token as Tokens.Paragraph;
			let text = paragraphToken.text;
			console.log('DEBUG: Processing paragraph text:', JSON.stringify(text));

			// Check if the paragraph contains ONLY an image (standalone image)
			const standaloneImageMatch = text.match(/^!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)\s*$/);
			if (standaloneImageMatch) {
				console.log('DEBUG: Converting standalone paragraph to ImageBlock:', text);
				const [, altText, href, title] = standaloneImageMatch;

				let cleanTitle: string | undefined = title;
				let size: string | undefined;

				if (title && title.includes('|')) {
					const parts = title.split('|');
					if (parts.length === 2) {
						const titlePart = parts[0].trim();
						cleanTitle = titlePart || undefined;
						size = parts[1].trim() || undefined;
					}
				}

				return {
					type: 'image',
					id,
					href,
					title: cleanTitle,
					text: altText,
					size,
					raw: paragraphToken.raw
				} as ImageBlock;
			}

			// For paragraphs with mixed content (text + images), process inline markdown
			// This will convert ![image](url) to clickable <img> tags
			text = await processInlineMarkdown(text);

			return {
				type: 'paragraph',
				id,
				text,
				raw: paragraphToken.raw
			} as ParagraphBlock;
		}

		case 'code': {
			const codeToken = token as Tokens.Code;
			const highlighted = highlightCode(codeToken.text, codeToken.lang || undefined);

			return {
				type: 'code',
				id,
				code: codeToken.text,
				language: codeToken.lang || undefined,
				highlighted,
				raw: codeToken.raw
			} as CodeBlock;
		}

		case 'list': {
			const listToken = token as Tokens.List;
			const items: ListItemBlock[] = [];

			for (const item of listToken.items) {
				const itemBlock = await convertTokenToBlock(item);
				if (itemBlock && itemBlock.type === 'list_item') {
					items.push(itemBlock as ListItemBlock);
				}
			}

			return {
				type: 'list',
				id,
				ordered: listToken.ordered,
				items,
				raw: listToken.raw
			} as ListBlock;
		}

		case 'list_item': {
			const itemToken = token as Tokens.ListItem;
			let text = itemToken.text;

			text = await processInlineMarkdown(text);

			return {
				type: 'list_item',
				id,
				text,
				raw: itemToken.raw
			} as ListItemBlock;
		}

		case 'blockquote': {
			const blockquoteToken = token as Tokens.Blockquote;
			let text = blockquoteToken.text;

			text = await processInlineMarkdown(text);

			return {
				type: 'blockquote',
				id,
				text,
				raw: blockquoteToken.raw
			} as BlockquoteBlock;
		}

		case 'table': {
			const tableToken = token as Tokens.Table;
			return {
				type: 'table',
				id,
				header: tableToken.header.map((cell) => cell.text),
				rows: tableToken.rows.map((row) => row.map((cell) => cell.text)),
				align: tableToken.align,
				raw: tableToken.raw
			} as TableBlock;
		}

		case 'html': {
			const htmlToken = token as Tokens.HTML;
			return {
				type: 'html',
				id,
				html: htmlToken.text,
				raw: htmlToken.raw
			} as HtmlBlock;
		}

		case 'hr': {
			return {
				type: 'hr',
				id,
				raw: token.raw
			} as HrBlock;
		}

		case 'image': {
			console.log('DEBUG: Converting image token to ImageBlock:', token);
			const imageToken = token as Tokens.Image;

			let cleanTitle = imageToken.title;
			let size: string | undefined;

			if (imageToken.title && imageToken.title.includes('|')) {
				const parts = imageToken.title.split('|');
				if (parts.length === 2) {
					cleanTitle = parts[0].trim() || null;
					size = parts[1].trim() || undefined;
				}
			}

			return {
				type: 'image',
				id,
				href: imageToken.href,
				title: cleanTitle,
				text: imageToken.text,
				size,
				raw: imageToken.raw
			} as ImageBlock;
		}

		case 'space':
			return null;

		default:
			console.warn('Unhandled token type:', token.type);
			return null;
	}
}
function preprocessWikiLinks(content: string): string {
	const wikiLinks: Array<{ placeholder: string; target: string; displayText: string }> = [];
	let linkIndex = 0;

	const processed = content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, display) => {
		const placeholder = `WIKILINK${linkIndex}PLACEHOLDER`;
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

	return `${processed}\n<!-- WIKI_SESSION:${sessionId} -->`;
}
interface WikiLink {
	target: string;
	displayText: string;
	path: string;
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
const INLINE_MARKDOWN_CACHE_SIZE = 200;
const inlineMarkdownCache = new Map<string, Promise<string>>();
async function processInlineMarkdown(text: string): Promise<string> {
	if (inlineMarkdownCache.has(text)) {
		const cached = inlineMarkdownCache.get(text)!;
		inlineMarkdownCache.delete(text);
		inlineMarkdownCache.set(text, cached);
		return cached;
	}

	const promise = (async () => {
		try {
			const htmlResult = await configuredMarked.parse(text, { async: true });
			const cleaned = htmlResult.replace(/^<p>(.*)<\/p>$/s, '$1').trim();
			return cleaned;
		} catch (error) {
			console.warn('Failed to process inline markdown:', error);
			return text;
		}
	})();

	inlineMarkdownCache.set(text, promise);

	if (inlineMarkdownCache.size > INLINE_MARKDOWN_CACHE_SIZE) {
		const firstKey = inlineMarkdownCache.keys().next().value;
		if (firstKey !== undefined) {
			inlineMarkdownCache.delete(firstKey);
		}
	}

	return promise;
}

export function initializeMarkdownInteractions(container: HTMLElement): void {
	if (!container) return;

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

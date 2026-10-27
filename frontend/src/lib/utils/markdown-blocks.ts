import { marked } from 'marked';
import type { Tokens } from 'marked';
import { configuredMarked } from './markdown';
import { highlightCode } from './markdown-config';
import { apiClient } from '#lib/api/client.ts';
import { generateSlug } from '#lib/utils/path.ts';
import { goto } from '$app/navigation';
import { replaceWikiLinks } from './wiki-link-syntax';
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
	task?: boolean;
	checked?: boolean;
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
	| ImageBlock;
let blockIdCounter = 0;
function generateBlockId(): string {
	return `block-${Date.now()}-${++blockIdCounter}`;
}
export async function parseMarkdownToBlocks(content: string): Promise<MarkdownBlock[]> {
	const processedContent = preprocessWikiLinks(content);
	let sessionId: string | null = null;

	try {
		sessionId = extractSessionId(processedContent);
		// Enable GitHub Flavored Markdown for task list support
		marked.setOptions({
			gfm: true,
			breaks: true
		});
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

	return `<span class="${linkClass}" data-wiki-target="${escapeHtml(resolvedLink.path)}" title="${escapeHtml(title)}">${escapeHtml(link.displayText)}</span>`;
}

function createBrokenLinkHtml(link: { target: string; displayText: string }): string {
	const slug = generateSlug(link.target);
	return `<span class="wiki-link broken-link text-red-500 cursor-default" data-wiki-target="/${escapeHtml(slug)}" title="Failed to resolve link">${escapeHtml(link.displayText)}</span>`;
}

// Wiki link text and targets come straight from the document source, so they
// must be escaped before being spliced into the generated HTML (the rendered
// output is sanitised as well, but escaping keeps attribute values intact).
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function replaceWikiLinkInBlocks(
	placeholder: string,
	linkHtml: string,
	blocks: MarkdownBlock[]
): void {
	const replace = (text: string) =>
		text.includes(placeholder) ? text.split(placeholder).join(linkHtml) : text;

	for (const block of blocks) {
		switch (block.type) {
			case 'paragraph':
			case 'heading':
			case 'blockquote':
			case 'list_item':
				block.text = replace(block.text);
				break;
			case 'list':
				for (const item of block.items) {
					item.text = replace(item.text);
				}
				break;
			case 'table':
				block.header = block.header.map(replace);
				block.rows = block.rows.map((row) => row.map(replace));
				break;
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

			// Check if the paragraph contains ONLY an image (standalone image)
			const standaloneImageMatch = text.match(/^!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)\s*$/);
			if (standaloneImageMatch) {
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

			// Check if this is a task list item
			const isTask = itemToken.task || false;
			const isChecked = itemToken.checked || false;

			text = await processInlineMarkdown(text);

			return {
				type: 'list_item',
				id,
				text,
				raw: itemToken.raw,
				task: isTask,
				checked: isChecked
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
				header: await Promise.all(tableToken.header.map((cell) => processInlineCell(cell.text))),
				rows: await Promise.all(
					tableToken.rows.map((row) => Promise.all(row.map((cell) => processInlineCell(cell.text))))
				),
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

	const processed = replaceWikiLinks(content, (target, display) => {
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

/**
 * Removes paragraph wrapper tags while preserving inner HTML formatting.
 * Uses DOMParser for more reliable HTML manipulation compared to regex.
 * This handles various cases where marked.js wraps content in <p> tags but we need
 * just the inner content for inline usage (like in headers).
 */
function removeParagraphWrappers(html: string): string {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const body = doc.body;

		// If the HTML is just a single <p>, get its innerHTML; otherwise, join all child nodes
		if (body.childNodes.length === 1 && body.firstChild?.nodeName === 'P') {
			return (body.firstChild as HTMLElement).innerHTML?.trim() ?? '';
		} else {
			return Array.from(body.childNodes)
				.map((node) => {
					if (node.nodeName === 'P') {
						return (node as HTMLElement).innerHTML;
					}
					return node.textContent;
				})
				.join(' ')
				.trim();
		}
	} catch (_error) {
		// Fallback to regex if DOMParser fails
		return html
			.replace(/^<p[^>]*>(.*)<\/p>$/s, '$1') // Remove p with attributes
			.replace(/^<p>(.*)<\/p>$/s, '$1') // Remove simple p tags
			.replace(/<\/p>\s*<p[^>]*>/g, ' ') // Replace p breaks with spaces
			.replace(/<\/?p[^>]*>/g, '') // Remove any remaining p tags
			.trim();
	}
}
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

			// Remove paragraph tags while preserving inner HTML formatting
			// This is necessary because marked.js wraps content in <p> tags, but for inline
			// content (like headers), we want just the inner HTML without the wrapper
			const cleaned = removeParagraphWrappers(htmlResult);
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

/**
 * Renders the inline markdown of a single table cell. Cells only hold inline
 * content, so this uses marked's inline parser (no paragraph/list/heading
 * interpretation). The result is sanitised when rendered by TableBlock.
 */
async function processInlineCell(text: string): Promise<string> {
	try {
		return (await marked.parseInline(text, { async: true })).trim();
	} catch (error) {
		console.warn('Failed to process table cell markdown:', error);
		return text;
	}
}

export function initializeMarkdownInteractions(container: HTMLElement): void {
	if (!container) return;

	const wikiLinks = container.querySelectorAll('.wiki-link');

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

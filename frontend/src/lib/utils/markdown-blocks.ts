import { marked } from 'marked';
import type { Tokens } from 'marked';
import { configuredMarked } from './markdown';
import hljs from 'highlight.js/lib/core';
import { apiClient } from '$lib/api/client';
import { generateSlug } from '$lib/utils/path';

// Import all the language modules (reusing from existing markdown.ts)
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

// Block type definitions
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

// Utility function to generate unique IDs
let blockIdCounter = 0;
function generateBlockId(): string {
	return `block-${Date.now()}-${++blockIdCounter}`;
}

// Function to highlight code
function highlightCode(code: string, language?: string): string {
	if (language && hljs.getLanguage(language)) {
		try {
			return hljs.highlight(code, { language }).value;
		} catch (error) {
			console.warn(`Failed to highlight code for language "${language}":`, error);
		}
	}

	return code
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// Main parsing function
export async function parseMarkdownToBlocks(content: string): Promise<MarkdownBlock[]> {
	// Preprocess wiki links
	const processedContent = preprocessWikiLinks(content);

	// Parse markdown using marked's lexer
	const tokens = marked.lexer(processedContent);
	const blocks: MarkdownBlock[] = [];

	for (const token of tokens) {
		const block = await convertTokenToBlock(token);
		if (block) {
			blocks.push(block);
		}
	}

	// Post-process all wiki links in all blocks
	await postprocessAllWikiLinks(blocks, processedContent);

	return blocks;
}

// Post-process wiki links across all blocks
async function postprocessAllWikiLinks(
	blocks: MarkdownBlock[],
	originalContent: string
): Promise<void> {
	// Find the session ID from the original content
	const sessionMatch = originalContent.match(/<!-- WIKI_SESSION:([^-]+) -->/);
	if (!sessionMatch) {
		return;
	}

	const sessionId = sessionMatch[1];

	const wikiLinks =
		((globalThis as Record<string, unknown>)[sessionId] as Array<{
			placeholder: string;
			target: string;
			displayText: string;
		}>) || [];

	if (wikiLinks.length === 0) {
		return;
	}

	// Process each wiki link
	for (const link of wikiLinks) {
		try {
			const resolvedLink = await resolveWikiLink(link.target);

			let linkClass = 'wiki-link text-blue-600 hover:text-blue-800 hover:underline cursor-pointer';
			let title = `Go to ${resolvedLink.target}`;

			// Check if document exists by trying to get it
			try {
				await apiClient.getDocumentByPath(resolvedLink.path);
			} catch (_error) {
				linkClass = 'wiki-link broken-link text-red-500 cursor-default';
				title = `Document "${resolvedLink.target}" does not exist`;
			}

			const linkHtml = `<span class="${linkClass}" data-wiki-target="${resolvedLink.path}" title="${title}">${link.displayText}</span>`;

			// Replace the placeholder in all paragraph blocks
			for (let i = 0; i < blocks.length; i++) {
				const block = blocks[i];
				if (block.type === 'paragraph') {
					const paragraphBlock = block as ParagraphBlock;
					if (paragraphBlock.text.includes(link.placeholder)) {
						const newText = paragraphBlock.text.split(link.placeholder).join(linkHtml);
						
						// Create a new block object to ensure Svelte reactivity
						blocks[i] = {
							...paragraphBlock,
							text: newText
						};
					}
				}
			}
		} catch (error) {
			console.warn(`Failed to resolve wiki link "${link.target}":`, error);
			// Fallback to basic broken link
			const slug = generateSlug(link.target);
			const linkHtml = `<span class="wiki-link broken-link text-red-500 cursor-default" data-wiki-target="/${slug}" title="Failed to resolve link">${link.displayText}</span>`;

			// Replace the placeholder in all paragraph blocks
			for (let i = 0; i < blocks.length; i++) {
				const block = blocks[i];
				if (block.type === 'paragraph') {
					const paragraphBlock = block as ParagraphBlock;
					if (paragraphBlock.text.includes(link.placeholder)) {
						const newText = paragraphBlock.text.split(link.placeholder).join(linkHtml);
						
						// Create a new block object to ensure Svelte reactivity
						blocks[i] = {
							...paragraphBlock,
							text: newText
						};
					}
				}
			}
		}
	}

	// Clean up the session
	delete (globalThis as Record<string, unknown>)[sessionId];
}

// Convert marked token to our block format
async function convertTokenToBlock(token: Tokens.Generic): Promise<MarkdownBlock | null> {
	const id = generateBlockId();

	switch (token.type) {
		case 'heading': {
			const headingToken = token as Tokens.Heading;
			let text = headingToken.text;

			// Process inline markdown elements (links, emphasis, code, etc.)
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

			// Check if this paragraph contains only an image
			const imageMatch = text.match(/^!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)\s*$/);
			if (imageMatch) {
				// Convert to image block instead of paragraph
				const [, altText, href, title] = imageMatch;

				// Parse size from title if present
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

			// Wiki links are now processed at the document level

			// Process inline markdown elements (links, emphasis, code, etc.)
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

			// Process inline markdown elements (links, emphasis, code, etc.)
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

			// Process inline markdown elements (links, emphasis, code, etc.)
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
			const imageToken = token as Tokens.Image;

			// Parse size from title if present (supports "Title|size" format)
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

		default:
			// Handle unrecognized token types by returning null
			console.warn('Unhandled token type:', token.type);
			return null;
	}
}

// Wiki link preprocessing (adapted from existing code)
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

// Wiki link resolution (adapted from original working code)
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

// Simple LRU cache for processInlineMarkdown
const INLINE_MARKDOWN_CACHE_SIZE = 200;
const inlineMarkdownCache = new Map<string, Promise<string>>();

// Process inline markdown elements within text
async function processInlineMarkdown(text: string): Promise<string> {
	if (inlineMarkdownCache.has(text)) {
		// Move to end to mark as recently used
		const cached = inlineMarkdownCache.get(text)!;
		inlineMarkdownCache.delete(text);
		inlineMarkdownCache.set(text, cached);
		return cached;
	}

	const promise = (async () => {
		try {
			// Use configured marked instance with custom renderer to parse inline markdown
			const htmlResult = await configuredMarked.parse(text, { async: true });
			// Remove wrapping <p> tags if present, but keep other HTML elements
			const cleaned = htmlResult.replace(/^<p>(.*)<\/p>$/s, '$1').trim();
			return cleaned;
		} catch (error) {
			console.warn('Failed to process inline markdown:', error);
			// Return original text as fallback
			return text;
		}
	})();

	inlineMarkdownCache.set(text, promise);

	// Enforce LRU cache size
	if (inlineMarkdownCache.size > INLINE_MARKDOWN_CACHE_SIZE) {
		const firstKey = inlineMarkdownCache.keys().next().value;
		if (firstKey !== undefined) {
			inlineMarkdownCache.delete(firstKey);
		}
	}

	return promise;
}

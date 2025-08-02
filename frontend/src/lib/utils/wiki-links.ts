import { EditorView, Decoration, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import type { Range } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import type { CompletionResult } from '@codemirror/autocomplete';
import { apiClient } from '$lib/api/client';
import { goto } from '$app/navigation';
import type { Document } from '$lib/api/types';

// Cache for documents to avoid frequent API calls
let documentsCache: Document[] = [];
let cacheTime = 0;
const CACHE_DURATION = 60000; // 1 minute (increased for better performance)

// Cache for document existence checks
const existsCache = new Map<string, { exists: boolean; time: number }>();
const EXISTS_CACHE_DURATION = 30000; // 30 seconds

async function getDocuments(): Promise<Document[]> {
	const now = Date.now();
	if (now - cacheTime > CACHE_DURATION || documentsCache.length === 0) {
		try {
			documentsCache = await apiClient.getDocuments();
			cacheTime = now;
		} catch (error) {
			console.warn('Failed to fetch documents for wiki links:', error);
			// Return empty array if fetch fails, don't crash
			return [];
		}
	}
	return documentsCache;
}

// Generate slug like the backend does
function generateSlug(title: string): string {
	return title
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^\w-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

// Check if a document exists with caching
async function documentExists(documentName: string): Promise<boolean> {
	const now = Date.now();
	const cacheKey = documentName.toLowerCase();

	// Check cache first
	const cached = existsCache.get(cacheKey);
	if (cached && now - cached.time < EXISTS_CACHE_DURATION) {
		return cached.exists;
	}

	try {
		const documents = await getDocuments();
		const exists = documents.some((document) => document.metaData.title.toLowerCase() === cacheKey);

		// Cache the result
		existsCache.set(cacheKey, { exists, time: now });

		return exists;
	} catch (error) {
		console.warn('Failed to check document existence:', error);
		return false;
	}
}

// Resolve document name to path
async function resolveDocumentPath(documentName: string): Promise<string> {
	const documents = await getDocuments();
	const matchingDocument = documents.find(
		(document) => document.metaData.title.toLowerCase() === documentName.toLowerCase()
	);

	if (matchingDocument) {
		return matchingDocument.metaData.path;
	}

	// If no exact match, generate slug-based path
	const slug = generateSlug(documentName);
	return `/${slug}`;
}

// Wiki link regex pattern
const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

// Widget for clickable wiki links
class WikiLinkWidget extends WidgetType {
	constructor(
		private documentName: string,
		private displayText: string,
		private exists: boolean
	) {
		super();
	}

	toDOM() {
		const span = document.createElement('span');
		span.className = this.exists
			? 'wiki-link cm-wiki-link'
			: 'wiki-link cm-wiki-link cm-wiki-link-broken';
		span.textContent = `[[${this.displayText}]]`;
		span.title = this.exists
			? `Go to ${this.documentName}`
			: `Document "${this.documentName}" does not exist (click to create)`;

		span.style.cursor = 'pointer';
		span.style.textDecoration = 'underline';
		span.style.color = this.exists ? '#2563eb' : '#dc2626';

		span.addEventListener('click', async (e) => {
			e.preventDefault();
			const path = await resolveDocumentPath(this.documentName);

			if (this.exists) {
				goto(`/documents${path}`);
			} else {
				goto(`/edit${path}`);
			}
		});

		return span;
	}

	eq(other: WikiLinkWidget) {
		return (
			this.documentName === other.documentName &&
			this.displayText === other.displayText &&
			this.exists === other.exists
		);
	}
}

// Effect for updating wiki link decorations
const updateWikiLinksEffect = StateEffect.define<DecorationSet>();

// State field for wiki link decorations
const wikiLinksField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		decorations = decorations.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(updateWikiLinksEffect)) {
				decorations = effect.value;
			}
		}
		return decorations;
	},
	provide: (f) => EditorView.decorations.from(f)
});

// Function to find and decorate wiki links
async function findWikiLinks(state: EditorState): Promise<Range<Decoration>[]> {
	const decorations: Range<Decoration>[] = [];
	const text = state.doc.toString();

	let match;
	wikiLinkRegex.lastIndex = 0; // Reset regex

	while ((match = wikiLinkRegex.exec(text)) !== null) {
		const [fullMatch, documentName, displayText] = match;
		const from = match.index;
		const to = match.index + fullMatch.length;

		if (!documentName?.trim()) continue;

		const exists = await documentExists(documentName.trim());
		const widget = new WikiLinkWidget(
			documentName.trim(),
			displayText?.trim() || documentName.trim(),
			exists
		);

		decorations.push(
			Decoration.replace({
				widget,
				inclusive: false
			}).range(from, to)
		);
	}

	return decorations;
}

// View plugin for wiki links
const wikiLinksPlugin = ViewPlugin.fromClass(
	class {
		private updateTimer: number | null = null;

		constructor(private view: EditorView) {
			this.scheduleUpdate();
		}

		update(update: ViewUpdate) {
			if (update.docChanged) {
				this.scheduleUpdate();
			}
		}

		destroy() {
			if (this.updateTimer !== null) {
				clearTimeout(this.updateTimer);
			}
		}

		private scheduleUpdate() {
			if (this.updateTimer !== null) {
				clearTimeout(this.updateTimer);
			}

			this.updateTimer = window.setTimeout(async () => {
				try {
					const decorations = await findWikiLinks(this.view.state);

					// Only update if the view is still valid
					if (this.view.state.doc) {
						this.view.dispatch({
							effects: updateWikiLinksEffect.of(Decoration.set(decorations))
						});
					}
				} catch (error) {
					console.warn('Failed to update wiki link decorations:', error);
				}
			}, 750); // Increased debounce for better performance
		}
	}
);

// Autocomplete for wiki links
async function wikiLinkCompletion(context: CompletionContext): Promise<CompletionResult | null> {
	const line = context.state.doc.lineAt(context.pos);
	const lineText = line.text;
	const lineStart = line.from;
	const cursorInLine = context.pos - lineStart;

	// Find if we're inside [[...]] brackets
	const beforeCursor = lineText.slice(0, cursorInLine);
	const afterCursor = lineText.slice(cursorInLine);

	const openBrackets = beforeCursor.lastIndexOf('[[');
	const closeBrackets = beforeCursor.lastIndexOf(']]');

	// Check if we're inside an open wiki link
	if (openBrackets === -1 || closeBrackets > openBrackets) {
		return null;
	}

	// Check if there's a closing bracket after cursor
	const nextCloseBrackets = afterCursor.indexOf(']]');
	if (nextCloseBrackets === -1) {
		return null;
	}

	// Extract the current search term
	const searchTerm = beforeCursor.slice(openBrackets + 2).split('|')[0];

	const documents = await getDocuments();
	const options = documents
		.filter((document) => document.metaData.title.toLowerCase().includes(searchTerm.toLowerCase()))
		.slice(0, 10) // Limit to 10 suggestions
		.map((document) => ({
			label: document.metaData.title,
			type: 'variable',
			detail: document.metaData.path,
			info: document.content ? document.content.slice(0, 100) + '...' : undefined
		}));

	if (options.length === 0) {
		return null;
	}

	return {
		from: lineStart + openBrackets + 2,
		to: lineStart + cursorInLine,
		options
	};
}

// Syntax highlighting for wiki links
const wikiLinkHighlight = syntaxHighlighting(
	HighlightStyle.define([
		{
			tag: tags.link,
			color: '#2563eb',
			textDecoration: 'underline'
		}
	])
);

// Key bindings for wiki link shortcuts (currently unused but available for future use)
// const wikiLinkKeymap = [
// 	{
// 		key: 'Ctrl-k',
// 		mac: 'Cmd-k',
// 		run: (view: EditorView) => {
// 			const selection = view.state.selection.main;
// 			const selectedText = view.state.doc.sliceString(selection.from, selection.to);

// 			const replacement = selectedText ? `[[${selectedText}]]` : '[[]]';

// 			const transaction = view.state.update({
// 				changes: { from: selection.from, to: selection.to, insert: replacement },
// 				selection: selectedText
// 					? { anchor: selection.from + replacement.length }
// 					: { anchor: selection.from + 2 } // Position cursor between brackets
// 			});

// 			view.dispatch(transaction);
// 			view.focus();
// 			return true;
// 		}
// 	}
// ];

// Main extension that combines all wiki link functionality
export function wikiLinksExtension() {
	return [
		wikiLinksField,
		wikiLinksPlugin,
		// Only provide wiki link completion when inside [[...]] brackets
		autocompletion({
			maxRenderedOptions: 10,
			activateOnTyping: true,
			override: [
				(context) => {
					// Only provide wiki completion inside wiki links, otherwise return null
					const result = wikiLinkCompletion(context);
					return result; // This will be null when not in wiki links
				}
			]
		}),
		wikiLinkHighlight,
		EditorView.theme({
			'.cm-wiki-link': {
				color: '#2563eb !important',
				textDecoration: 'underline',
				cursor: 'pointer'
			},
			'.cm-wiki-link-broken': {
				color: '#dc2626 !important'
			}
		})
	];
}

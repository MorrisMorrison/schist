import { EditorView, Decoration, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import type { Range } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { goto } from '$app/navigation';
import { generateSlug } from '$lib/utils/path';
import { getCachedDocuments } from '$lib/utils/markdown-cache';
import { findWikiLinkMatches } from '$lib/utils/wiki-link-syntax';

const existsCache = new Map<string, { exists: boolean; time: number }>();
const EXISTS_CACHE_DURATION = 30000;

async function documentExists(documentName: string): Promise<boolean> {
	const now = Date.now();
	const cacheKey = documentName.toLowerCase();

	const cached = existsCache.get(cacheKey);
	if (cached && now - cached.time < EXISTS_CACHE_DURATION) {
		return cached.exists;
	}

	try {
		const documents = await getCachedDocuments();
		const exists = documents.some(
			(document) => document.metaData?.title?.toLowerCase() === cacheKey
		);

		existsCache.set(cacheKey, { exists, time: now });

		return exists;
	} catch (error) {
		console.warn('Failed to check document existence:', error);
		return false;
	}
}

async function resolveDocumentPath(documentName: string): Promise<string> {
	const documents = await getCachedDocuments();
	const matchingDocument = documents.find(
		(document) => document.metaData?.title?.toLowerCase() === documentName.toLowerCase()
	);

	if (matchingDocument && matchingDocument.metaData?.path) {
		return matchingDocument.metaData.path;
	}

	const slug = generateSlug(documentName);
	return `/${slug}`;
}

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

const updateWikiLinksEffect = StateEffect.define<DecorationSet>();
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

async function findWikiLinks(state: EditorState): Promise<Range<Decoration>[]> {
	const decorations: Range<Decoration>[] = [];
	const text = state.doc.toString();

	for (const { from, to, target: documentName, display: displayText } of findWikiLinkMatches(
		text
	)) {
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

					if (this.view.state.doc) {
						this.view.dispatch({
							effects: updateWikiLinksEffect.of(Decoration.set(decorations))
						});
					}
				} catch (error) {
					console.warn('Failed to update wiki link decorations:', error);
				}
			}, 750);
		}
	}
);

const wikiLinkHighlight = syntaxHighlighting(
	HighlightStyle.define([
		{
			tag: tags.link,
			color: '#2563eb',
			textDecoration: 'underline'
		}
	])
);

export function wikiLinksExtension() {
	return [
		wikiLinksField,
		wikiLinksPlugin,
		wikiLinkHighlight,
		EditorView.theme({
			'.cm-wiki-link': {
				color: '#2563eb !important',
				textDecoration: 'underline',
				cursor: 'pointer'
			},
			'.cm-wiki-link-broken': {
				color: '#dc2626 !important'
			},
			// Autocomplete dropdown styling
			'.cm-tooltip': {
				backgroundColor: 'var(--background)',
				border: '1px solid var(--border)',
				borderRadius: 'calc(var(--radius) - 2px)',
				boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)'
			},
			'.cm-tooltip-autocomplete': {
				backgroundColor: 'var(--background)',
				border: '1px solid var(--border)'
			},
			'.cm-tooltip-autocomplete ul': {
				maxHeight: '200px',
				overflowY: 'auto'
			},
			'.cm-tooltip-autocomplete ul li': {
				padding: '8px 12px',
				cursor: 'pointer',
				color: 'var(--foreground)',
				borderBottom: '1px solid var(--border)'
			},
			'.cm-tooltip-autocomplete ul li:last-child': {
				borderBottom: 'none'
			},
			'.cm-tooltip-autocomplete ul li[aria-selected]': {
				backgroundColor: 'var(--accent)',
				color: 'var(--accent-foreground)'
			},
			'.cm-completionLabel': {
				color: 'var(--foreground)',
				fontWeight: '500'
			},
			'.cm-completionDetail': {
				color: 'var(--muted-foreground)',
				fontSize: '0.875rem',
				fontStyle: 'italic'
			},
			'.cm-completionInfo': {
				color: 'var(--muted-foreground)',
				padding: '8px',
				backgroundColor: 'var(--muted)',
				borderRadius: 'calc(var(--radius) - 4px)',
				fontSize: '0.875rem'
			}
		})
	];
}

import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import type { Range } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { goto } from '$app/navigation';
import { generateSlug } from '#lib/utils/path.ts';
import { getCachedDocuments } from '#lib/utils/markdown-cache.ts';
import { findWikiLinkMatches } from '#lib/utils/wiki-link-syntax.ts';
import { asyncDecorations, autocompleteTheme } from './async-decorations';

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
		...asyncDecorations(findWikiLinks, 'wiki link'),
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
		}),
		autocompleteTheme
	];
}

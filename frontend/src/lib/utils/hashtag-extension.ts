import { EditorView, Decoration, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import type { Range } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import type { CompletionResult } from '@codemirror/autocomplete';
import { apiClient } from '$lib/api/client';
import type { TagInfo } from '$lib/api/types';

let tagsCache: TagInfo[] = [];
let cacheTime = 0;
const CACHE_DURATION = 60000;

async function getTags(): Promise<TagInfo[]> {
	const now = Date.now();
	if (now - cacheTime > CACHE_DURATION || tagsCache.length === 0) {
		try {
			const response = await apiClient.getAllTags();
			tagsCache = response.tags;
			cacheTime = now;
		} catch (error) {
			console.warn('Failed to fetch tags for hashtag autocomplete:', error);
			return [];
		}
	}
	return tagsCache;
}

const hashtagRegex = /#([a-zA-Z0-9_-]+)(?!\w)/g;

class HashtagWidget extends WidgetType {
	constructor(
		private tagName: string,
		private exists: boolean
	) {
		super();
	}

	toDOM() {
		const span = document.createElement('span');
		span.className = this.exists ? 'hashtag cm-hashtag' : 'hashtag cm-hashtag cm-hashtag-new';
		span.textContent = `#${this.tagName}`;
		span.title = this.exists ? `Tag: ${this.tagName}` : `New tag: ${this.tagName}`;

		span.style.cursor = 'pointer';
		span.style.color = '#2563eb';
		span.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
		span.style.borderRadius = '4px';
		span.style.padding = '1px 4px';
		span.style.fontSize = '0.875rem';
		span.style.fontWeight = '500';

		return span;
	}

	eq(other: HashtagWidget) {
		return this.tagName === other.tagName && this.exists === other.exists;
	}
}

const updateHashtagsEffect = StateEffect.define<DecorationSet>();
const hashtagsField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		decorations = decorations.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(updateHashtagsEffect)) {
				decorations = effect.value;
			}
		}
		return decorations;
	},
	provide: (f) => EditorView.decorations.from(f)
});

async function findHashtags(state: EditorState): Promise<Range<Decoration>[]> {
	const decorations: Range<Decoration>[] = [];
	const text = state.doc.toString();
	const existingTags = await getTags();
	const existingTagNames = new Set(existingTags.map((tag) => tag.name.toLowerCase()));

	let match;
	hashtagRegex.lastIndex = 0;

	while ((match = hashtagRegex.exec(text)) !== null) {
		const [fullMatch, tagName] = match;
		const from = match.index;
		const to = match.index + fullMatch.length;

		if (!tagName?.trim()) continue;

		const exists = existingTagNames.has(tagName.toLowerCase());
		const widget = new HashtagWidget(tagName, exists);

		decorations.push(
			Decoration.replace({
				widget,
				inclusive: false
			}).range(from, to)
		);
	}

	return decorations;
}

// View plugin for hashtags
const hashtagsPlugin = ViewPlugin.fromClass(
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
					const decorations = await findHashtags(this.view.state);

					if (this.view.state.doc) {
						this.view.dispatch({
							effects: updateHashtagsEffect.of(Decoration.set(decorations))
						});
					}
				} catch (error) {
					console.warn('Failed to update hashtag decorations:', error);
				}
			}, 750);
		}
	}
);

async function hashtagCompletion(context: CompletionContext): Promise<CompletionResult | null> {
	const line = context.state.doc.lineAt(context.pos);
	const lineText = line.text;
	const lineStart = line.from;
	const cursorInLine = context.pos - lineStart;

	const beforeCursor = lineText.slice(0, cursorInLine);
	const afterCursor = lineText.slice(cursorInLine);

	// Look for hashtag pattern before cursor
	const hashMatch = beforeCursor.match(/#([a-zA-Z0-9_-]*)$/);
	if (!hashMatch) {
		return null;
	}

	const [fullMatch, searchTerm] = hashMatch;
	const hashStart = beforeCursor.lastIndexOf(fullMatch);

	// Make sure we're not inside a word
	if (afterCursor.match(/^[a-zA-Z0-9_-]/)) {
		return null;
	}

	const existingTags = await getTags();
	const options = existingTags
		.filter((tag) => tag.name.toLowerCase().includes(searchTerm.toLowerCase()))
		.slice(0, 10)
		.map((tag) => ({
			label: tag.name,
			type: 'variable',
			detail: `Used ${tag.count} time${tag.count !== 1 ? 's' : ''}`,
			info: `#${tag.name}`
		}));

	if (options.length === 0) {
		return null;
	}

	return {
		from: lineStart + hashStart + 1, // +1 to skip the #
		to: lineStart + cursorInLine,
		options
	};
}

const hashtagHighlight = syntaxHighlighting(
	HighlightStyle.define([
		{
			tag: tags.keyword,
			color: '#2563eb',
			backgroundColor: 'rgba(37, 99, 235, 0.1)',
			borderRadius: '4px',
			padding: '1px 4px'
		}
	])
);

export function hashtagExtension() {
	return [
		hashtagsField,
		hashtagsPlugin,
		autocompletion({
			maxRenderedOptions: 10,
			activateOnTyping: true,
			override: [
				(context) => {
					const result = hashtagCompletion(context);
					return result;
				}
			]
		}),
		hashtagHighlight,
		EditorView.theme({
			'.cm-hashtag': {
				color: '#2563eb !important',
				backgroundColor: 'rgba(37, 99, 235, 0.1)',
				borderRadius: '4px',
				padding: '1px 4px',
				fontSize: '0.875rem',
				fontWeight: '500',
				cursor: 'pointer'
			},
			'.cm-hashtag-new': {
				backgroundColor: 'rgba(37, 99, 235, 0.05)',
				fontStyle: 'italic'
			},
			// Autocomplete dropdown styling to match existing design
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

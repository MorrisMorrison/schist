import { EditorView, Decoration } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import type { Range } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { getCachedTags } from '$lib/utils/markdown-cache';
import { HASHTAG_REGEX } from './hashtag-constants';
import { asyncDecorations, autocompleteTheme } from './async-decorations';

async function findHashtags(state: EditorState): Promise<Range<Decoration>[]> {
	const decorations: Range<Decoration>[] = [];
	const text = state.doc.toString();
	const existingTags = await getCachedTags();
	const existingTagNames = new Set(existingTags.map((tag) => tag.name.toLowerCase()));

	let match;
	HASHTAG_REGEX.lastIndex = 0;

	while ((match = HASHTAG_REGEX.exec(text)) !== null) {
		const [fullMatch, tagName] = match;
		const from = match.index;
		const to = match.index + fullMatch.length;

		if (!tagName?.trim()) continue;

		const exists = existingTagNames.has(tagName.toLowerCase());

		decorations.push(
			Decoration.mark({
				class: exists ? 'cm-hashtag' : 'cm-hashtag cm-hashtag-new',
				attributes: {
					title: exists ? `Tag: ${tagName}` : `New tag: ${tagName}`
				}
			}).range(from, to)
		);
	}

	return decorations;
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
		...asyncDecorations(findHashtags, 'hashtag'),
		// Autocompletion moved to combined-autocomplete.ts
		hashtagHighlight,
		EditorView.theme({
			'.cm-hashtag': {
				color: 'var(--primary) !important',
				backgroundColor: 'var(--secondary)',
				border: '1px solid var(--border)',
				borderRadius: '6px',
				padding: '2px 6px',
				fontSize: '0.75rem',
				fontWeight: '600',
				cursor: 'pointer',
				textDecoration: 'none'
			},
			'.cm-hashtag-new': {
				backgroundColor: 'var(--muted)',
				fontStyle: 'italic',
				border: '1px dashed var(--border)'
			}
		}),
		autocompleteTheme
	];
}

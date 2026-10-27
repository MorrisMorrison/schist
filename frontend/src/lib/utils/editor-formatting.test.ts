import { describe, it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { FormattingType } from '#lib/types/editor.ts';
import { applyFormatting, formatMarkdown } from './editor-formatting';

describe('formatMarkdown', () => {
	const cases: [FormattingType, string, string | undefined, string, number][] = [
		['bold', '', undefined, '**bold text**', -2],
		['bold', 'x', undefined, '**x**', 0],
		['italic', '', undefined, '*italic text*', -1],
		['italic', 'x', undefined, '*x*', 0],
		['heading1', '', undefined, '# Heading 1', 0],
		['heading2', 'Intro', undefined, '## Intro', 0],
		['heading3', '', undefined, '### Heading 3', 0],
		['bulletList', '', undefined, '- List item', 0],
		['numberedList', 'one', undefined, '1. one', 0],
		['link', '', undefined, '[link text](https://example.com)', -20],
		['link', 'docs', 'https://x.dev', '[docs](https://x.dev)', 0],
		['wikiLink', '', undefined, '[[Document Name]]', -2],
		['wikiLink', 'Plan', undefined, '[[Plan]]', 0],
		['code', '', undefined, '`code`', -1],
		['quote', 'hi', undefined, '> hi', 0]
	];

	it.each(cases)('%s of "%s" (%s) -> %s', (type, selected, value, text, cursorOffset) => {
		expect(formatMarkdown(type, selected, value)).toEqual({ text, cursorOffset });
	});
});

describe('applyFormatting', () => {
	let view: EditorView | null = null;

	afterEach(() => {
		view?.destroy();
		view = null;
	});

	function editor(doc: string, from: number, to = from) {
		view = new EditorView({
			parent: document.body,
			state: EditorState.create({ doc, selection: { anchor: from, head: to } })
		});
		return view;
	}

	it('wraps the selection', () => {
		const v = editor('make this bold', 5, 9);

		applyFormatting(v, 'bold');

		expect(v.state.doc.toString()).toBe('make **this** bold');
	});

	it('inserts a placeholder and puts the cursor inside the markers', () => {
		const v = editor('', 0);

		applyFormatting(v, 'bold');

		expect(v.state.doc.toString()).toBe('**bold text**');
		expect(v.state.selection.main.head).toBe('**bold text'.length);
		expect(v.hasFocus).toBe(true);
	});

	it('uses the given URL for links', () => {
		const v = editor('see docs', 4, 8);

		applyFormatting(v, 'link', 'https://x.dev');

		expect(v.state.doc.toString()).toBe('see [docs](https://x.dev)');
	});
});

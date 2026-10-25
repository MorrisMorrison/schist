import { describe, it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { buildProseDecorations, proseMarkdown } from './prose-markdown';

let view: EditorView | null = null;

afterEach(() => {
	view?.destroy();
	view = null;
});

function editor(doc: string) {
	view = new EditorView({
		parent: document.body,
		state: EditorState.create({
			doc,
			extensions: [markdown({ base: markdownLanguage }), proseMarkdown()]
		})
	});
	ensureSyntaxTree(view.state, view.state.doc.length, 5000);
	// Rebuild once the full tree is there (parsing can finish after construction).
	view.dispatch({});
	return view;
}

/** The classes of each rendered line, in order. */
function lineClasses(v: EditorView): string[] {
	return [...v.contentDOM.querySelectorAll('.cm-line')].map((line) =>
		[...line.classList].filter((c) => c.startsWith('cm-prose')).join(' ')
	);
}

/** [class, text] for every inline mark span. */
function marks(v: EditorView): [string, string][] {
	return [...v.contentDOM.querySelectorAll('span[class^="cm-prose"]')].map((el) => [
		el.className,
		el.textContent ?? ''
	]);
}

describe('proseMarkdown', () => {
	it('sizes headings and treats a leading H1 as the title', () => {
		const v = editor('# Title\n\n## Section\n\n### Sub\n\n# Another H1');

		expect(lineClasses(v)).toEqual([
			'cm-prose-heading cm-prose-h1 cm-prose-title',
			'',
			'cm-prose-heading cm-prose-h2',
			'',
			'cm-prose-heading cm-prose-h3',
			'',
			'cm-prose-heading cm-prose-h1'
		]);
	});

	it('marks emphasis, code, links and their syntax without hiding anything', () => {
		const source = 'Some **bold**, *em*, ~~gone~~, `code` and [a link](https://x.dev).';
		const v = editor(source);

		expect(v.contentDOM.textContent).toBe(source);
		const found = marks(v);
		expect(found).toContainEqual(['cm-prose-strong', expect.stringContaining('bold')]);
		expect(found).toContainEqual(['cm-prose-em', expect.stringContaining('em')]);
		expect(found).toContainEqual(['cm-prose-strike', expect.stringContaining('gone')]);
		expect(found).toContainEqual(['cm-prose-code', expect.stringContaining('code')]);
		expect(found).toContainEqual(['cm-prose-url', 'https://x.dev']);
		expect(found.some(([cls, text]) => cls === 'cm-prose-mark' && text === '**')).toBe(true);
	});

	it('styles block quotes, fenced code and tables line by line', () => {
		const v = editor(
			'> quoted\n> more\n\n```ts\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |'
		);

		expect(lineClasses(v)).toEqual([
			'cm-prose-quote',
			'cm-prose-quote',
			'',
			'cm-prose-codeblock cm-prose-codeblock-first',
			'cm-prose-codeblock',
			'cm-prose-codeblock cm-prose-codeblock-last',
			'',
			'cm-prose-table',
			'cm-prose-table',
			'cm-prose-table'
		]);
	});

	it('leaves markup inside code alone', () => {
		const v = editor('`**not bold**`');

		expect(marks(v).some(([cls]) => cls === 'cm-prose-strong')).toBe(false);
	});

	it('restyles after an edit', () => {
		const v = editor('plain');

		v.dispatch({ changes: { from: 0, insert: '# ' } });
		ensureSyntaxTree(v.state, v.state.doc.length, 5000);
		v.dispatch({});

		expect(lineClasses(v)).toEqual(['cm-prose-heading cm-prose-h1 cm-prose-title']);
		expect(buildProseDecorations(v).size).toBeGreaterThan(0);
	});
});

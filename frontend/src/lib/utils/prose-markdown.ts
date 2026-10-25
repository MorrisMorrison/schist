// Markdown source styled like the reading view: heading sizes, emphasis, quotes,
// monospace code and tables. Nothing is hidden; every character of the source
// stays visible and editable. Decorations are computed from the Lezer markdown
// tree for the visible ranges only.
import { syntaxTree } from '@codemirror/language';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	type DecorationSet,
	type ViewUpdate
} from '@codemirror/view';
import type { Extension, Range } from '@codemirror/state';

const INLINE_CLASSES: Record<string, string> = {
	Emphasis: 'cm-prose-em',
	StrongEmphasis: 'cm-prose-strong',
	Strikethrough: 'cm-prose-strike',
	InlineCode: 'cm-prose-code',
	Link: 'cm-prose-link',
	URL: 'cm-prose-url'
};

export function buildProseDecorations(view: EditorView): DecorationSet {
	const { doc } = view.state;
	const out: Range<Decoration>[] = [];
	// A block that spans two visible ranges is visited twice; style each line once.
	const styledLines = new Set<string>();

	const lineClass = (pos: number, cls: string) => {
		const line = doc.lineAt(pos);
		const key = `${line.from}:${cls}`;
		if (styledLines.has(key)) return;
		styledLines.add(key);
		out.push(Decoration.line({ class: cls }).range(line.from));
	};
	const linesClass = (from: number, to: number, cls: string) => {
		const last = doc.lineAt(to).number;
		for (let n = doc.lineAt(from).number; n <= last; n++) lineClass(doc.line(n).from, cls);
	};

	const tree = syntaxTree(view.state);
	for (const { from, to } of view.visibleRanges) {
		tree.iterate({
			from,
			to,
			enter: (node) => {
				const heading = /^ATXHeading(\d)$/.exec(node.name);
				if (heading) {
					const isTitle = doc.lineAt(node.from).number === 1 && heading[1] === '1';
					lineClass(
						node.from,
						`cm-prose-heading cm-prose-h${heading[1]}${isTitle ? ' cm-prose-title' : ''}`
					);
					return;
				}

				const inline = INLINE_CLASSES[node.name];
				if (inline) {
					if (node.to > node.from)
						out.push(Decoration.mark({ class: inline }).range(node.from, node.to));
					return node.name === 'InlineCode' ? false : undefined;
				}

				switch (node.name) {
					case 'HeaderMark':
					case 'EmphasisMark':
					case 'CodeMark':
					case 'LinkMark':
					case 'QuoteMark':
					case 'ListMark':
					case 'StrikethroughMark':
					case 'TaskMarker':
						if (node.to > node.from) {
							out.push(Decoration.mark({ class: 'cm-prose-mark' }).range(node.from, node.to));
						}
						return;
					case 'Blockquote':
						linesClass(node.from, node.to, 'cm-prose-quote');
						return;
					case 'FencedCode':
					case 'CodeBlock':
						linesClass(node.from, node.to, 'cm-prose-codeblock');
						if (node.name === 'FencedCode') {
							lineClass(node.from, 'cm-prose-codeblock-first');
							lineClass(node.to, 'cm-prose-codeblock-last');
						}
						return false;
					case 'Table':
						linesClass(node.from, node.to, 'cm-prose-table');
						return false;
					case 'HTMLBlock':
					case 'CommentBlock':
						return false;
				}
			}
		});
	}

	return Decoration.set(out, true);
}

const proseDecorations = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = buildProseDecorations(view);
		}
		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.viewportChanged ||
				syntaxTree(update.startState) !== syntaxTree(update.state)
			) {
				this.decorations = buildProseDecorations(update.view);
			}
		}
	},
	{ decorations: (plugin) => plugin.decorations }
);

const MONO = "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Consolas, monospace";

/**
 * The editor's look, matched to the reading view (`.reading`, HeadingBlock):
 * Inter at reading size, no gutters, the same heading scale, monospace only for
 * code and tables. Colours come from the theme's CSS variables, so light and
 * dark need no separate themes.
 */
export const proseTheme = EditorView.theme({
	'&': {
		backgroundColor: 'transparent',
		color: 'var(--foreground)',
		fontSize: '1.03rem'
	},
	'&.cm-focused': { outline: 'none' },
	'.cm-scroller': {
		fontFamily: 'inherit',
		lineHeight: '1.72',
		overflow: 'visible'
	},
	// A little room below the last line, so it isn't glued to the window edge.
	'.cm-content': { padding: '0 0 4rem 0', caretColor: 'var(--primary)' },
	'.cm-line': { padding: '0' },
	'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)', borderLeftWidth: '2px' },
	'&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
		{
			backgroundColor: 'color-mix(in oklab, var(--primary) 25%, transparent)'
		},
	'.cm-prose-mark': { color: 'var(--muted-foreground)' },
	'.cm-prose-heading': { fontWeight: '700', letterSpacing: '-0.02em', lineHeight: '1.3' },
	'.cm-prose-h1': { fontSize: '2rem', paddingTop: '1.25rem', paddingBottom: '0.25rem' },
	'.cm-prose-h2': { fontSize: '1.625rem', paddingTop: '1.25rem', paddingBottom: '0.25rem' },
	'.cm-prose-h3': { fontSize: '1.375rem', paddingTop: '1rem' },
	'.cm-prose-h4, .cm-prose-h5, .cm-prose-h6': { fontSize: '1.125rem', paddingTop: '0.75rem' },
	// The first `# Title` line is the document title while editing (the header
	// hides its own copy), so it gets the header's size.
	'.cm-prose-title': { fontSize: '2.25rem', paddingTop: '0', paddingBottom: '0.75rem' },
	'.cm-prose-strong': { fontWeight: '700' },
	'.cm-prose-em': { fontStyle: 'italic' },
	'.cm-prose-strike': { textDecoration: 'line-through' },
	'.cm-prose-link': { color: 'var(--primary)' },
	'.cm-prose-url': { color: 'var(--muted-foreground)' },
	'.cm-prose-code, .cm-prose-codeblock, .cm-prose-table': {
		fontFamily: MONO,
		fontSize: '0.875em'
	},
	'.cm-prose-code': {
		backgroundColor: 'var(--muted)',
		borderRadius: '4px',
		padding: '0.1em 0.25em'
	},
	'.cm-prose-codeblock': {
		backgroundColor: 'color-mix(in oklab, var(--muted) 60%, transparent)',
		paddingLeft: '1rem !important',
		paddingRight: '1rem !important'
	},
	'.cm-prose-codeblock-first': {
		borderTopLeftRadius: '8px',
		borderTopRightRadius: '8px',
		paddingTop: '0.5rem'
	},
	'.cm-prose-codeblock-last': {
		borderBottomLeftRadius: '8px',
		borderBottomRightRadius: '8px',
		paddingBottom: '0.5rem'
	},
	'.cm-prose-quote': {
		borderLeft: '4px solid var(--border)',
		paddingLeft: '1rem !important',
		color: 'var(--muted-foreground)',
		fontStyle: 'italic'
	}
});

/** Prose styling for markdown source (decorations + theme). */
export function proseMarkdown(): Extension {
	return [proseDecorations, proseTheme];
}

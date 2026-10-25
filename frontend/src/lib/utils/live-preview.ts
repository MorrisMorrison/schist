// PROTOTYPE (issue #246): Obsidian-style markdown editing in CodeMirror 6.
//
// proseMarkdown() styles the source like the reading view (heading sizes, quotes,
// code blocks) without hiding anything. livePreview() additionally hides markdown
// syntax outside the element (inline) or line (block) that holds the selection,
// and swaps list bullets, task markers and rules for small widgets.
//
// Both walk the Lezer markdown tree for the visible ranges only and rebuild on doc,
// viewport, selection and focus changes.
import { syntaxTree } from '@codemirror/language';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	type DecorationSet,
	type ViewUpdate
} from '@codemirror/view';
import type { Extension, Range } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { findWikiLinkMatches } from '$lib/utils/wiki-link-syntax';

const hidden = Decoration.replace({});

class BulletWidget extends WidgetType {
	eq() {
		return true;
	}
	toDOM() {
		const span = document.createElement('span');
		span.className = 'cm-lp-bullet';
		span.textContent = '•';
		return span;
	}
}

class RuleWidget extends WidgetType {
	eq() {
		return true;
	}
	toDOM() {
		const span = document.createElement('span');
		span.className = 'cm-lp-hr';
		return span;
	}
}

class CheckboxWidget extends WidgetType {
	constructor(
		readonly checked: boolean,
		readonly pos: number
	) {
		super();
	}
	eq(other: CheckboxWidget) {
		return other.checked === this.checked && other.pos === this.pos;
	}
	toDOM(view: EditorView) {
		const box = document.createElement('input');
		box.type = 'checkbox';
		box.checked = this.checked;
		box.className = 'cm-lp-task';
		box.setAttribute('aria-label', this.checked ? 'Mark as not done' : 'Mark as done');
		box.addEventListener('mousedown', (event) => {
			event.preventDefault();
			// `[ ]` <-> `[x]`: only the middle character changes.
			view.dispatch({
				changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' }
			});
		});
		return box;
	}
	ignoreEvent() {
		return true;
	}
}

function build(view: EditorView, hideSyntax: boolean): DecorationSet {
	const { state } = view;
	const doc = state.doc;
	const ranges = state.selection.ranges;
	const focused = view.hasFocus;
	const out: Range<Decoration>[] = [];
	const lineClasses = new Set<string>();

	// Syntax shows again where the user is working: inline marks for the element
	// the selection touches, block marks for the lines it touches.
	const touches = (from: number, to: number) =>
		focused && ranges.some((r) => r.from <= to && r.to >= from);
	const lineTouched = (pos: number) => {
		const line = doc.lineAt(pos);
		return touches(line.from, line.to);
	};
	const lineClass = (pos: number, cls: string) => {
		const line = doc.lineAt(pos);
		const key = `${line.from}:${cls}`;
		if (lineClasses.has(key)) return;
		lineClasses.add(key);
		out.push(Decoration.line({ class: cls }).range(line.from));
	};
	const linesClass = (from: number, to: number, cls: string) => {
		for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
			lineClass(doc.line(n).from, cls);
		}
	};
	// Hide a mark plus the single space that follows it (`# `, `> `, `- `).
	const hideWithSpace = (from: number, to: number) => {
		const end = to < doc.length && doc.sliceString(to, to + 1) === ' ' ? to + 1 : to;
		out.push(hidden.range(from, end));
	};
	const marks = (node: SyntaxNode, name: string) => node.getChildren(name);

	const tree = syntaxTree(state);
	for (const { from, to } of view.visibleRanges) {
		tree.iterate({
			from,
			to,
			enter: (ref) => {
				const node = ref.node;
				const heading = /^ATXHeading(\d)$/.exec(ref.name);
				if (heading) {
					const first = doc.lineAt(ref.from).number === 1;
					lineClass(ref.from, `cm-lp-h cm-lp-h${heading[1]}${first ? ' cm-lp-title' : ''}`);
					if (hideSyntax && !lineTouched(ref.from)) {
						for (const mark of marks(node, 'HeaderMark')) hideWithSpace(mark.from, mark.to);
					}
					return;
				}

				switch (ref.name) {
					case 'Emphasis':
					case 'StrongEmphasis':
					case 'Strikethrough':
					case 'InlineCode': {
						const cls = {
							Emphasis: 'cm-lp-em',
							StrongEmphasis: 'cm-lp-strong',
							Strikethrough: 'cm-lp-strike',
							InlineCode: 'cm-lp-code'
						}[ref.name];
						out.push(Decoration.mark({ class: cls }).range(ref.from, ref.to));
						if (hideSyntax && !touches(ref.from, ref.to)) {
							const markName = {
								Emphasis: 'EmphasisMark',
								StrongEmphasis: 'EmphasisMark',
								Strikethrough: 'StrikethroughMark',
								InlineCode: 'CodeMark'
							}[ref.name];
							for (const mark of marks(node, markName)) out.push(hidden.range(mark.from, mark.to));
						}
						return ref.name === 'InlineCode' ? false : undefined;
					}
					case 'Link': {
						const linkMarks = marks(node, 'LinkMark');
						if (linkMarks.length < 2) return;
						const [open, close] = linkMarks;
						out.push(Decoration.mark({ class: 'cm-lp-link' }).range(open.to, close.from));
						if (hideSyntax && !touches(ref.from, ref.to)) {
							out.push(hidden.range(open.from, open.to));
							out.push(hidden.range(close.from, ref.to));
						}
						return false;
					}
					case 'Blockquote':
						linesClass(ref.from, ref.to, 'cm-lp-quote');
						return;
					case 'QuoteMark':
						if (hideSyntax && !lineTouched(ref.from)) hideWithSpace(ref.from, ref.to);
						return;
					case 'ListMark': {
						const item = node.parent;
						if (!hideSyntax || !item || lineTouched(ref.from)) return;
						if (item.getChild('Task')) {
							hideWithSpace(ref.from, ref.to);
						} else if (item.parent?.name === 'BulletList') {
							out.push(Decoration.replace({ widget: new BulletWidget() }).range(ref.from, ref.to));
						}
						return;
					}
					case 'TaskMarker': {
						if (!hideSyntax || lineTouched(ref.from)) return;
						const checked = doc.sliceString(ref.from + 1, ref.from + 2).toLowerCase() === 'x';
						out.push(
							Decoration.replace({ widget: new CheckboxWidget(checked, ref.from) }).range(
								ref.from,
								ref.to
							)
						);
						if (checked) {
							const line = doc.lineAt(ref.from);
							if (ref.to + 1 < line.to) {
								out.push(Decoration.mark({ class: 'cm-lp-done' }).range(ref.to + 1, line.to));
							}
						}
						return;
					}
					case 'FencedCode':
					case 'CodeBlock':
						linesClass(ref.from, ref.to, 'cm-lp-codeblock');
						if (ref.name === 'FencedCode') {
							lineClass(ref.from, 'cm-lp-fence cm-lp-fence-open');
							lineClass(ref.to, 'cm-lp-fence cm-lp-fence-close');
						}
						return false;
					case 'HorizontalRule':
						if (hideSyntax && !lineTouched(ref.from)) {
							out.push(Decoration.replace({ widget: new RuleWidget() }).range(ref.from, ref.to));
						}
						return false;
					case 'Table':
						linesClass(ref.from, ref.to, 'cm-lp-table');
						return false;
				}
			}
		});
	}

	// Wiki links are not part of the Lezer markdown grammar; reuse the shared
	// matcher (skips code) and show only the display text away from the cursor.
	for (const link of findWikiLinkMatches(doc.toString())) {
		if (!view.visibleRanges.some((r) => link.from <= r.to && link.to >= r.from)) continue;
		const inner = doc.sliceString(link.from + 2, link.to - 2);
		const pipe = inner.indexOf('|');
		const textFrom = pipe >= 0 ? link.from + 2 + pipe + 1 : link.from + 2;
		out.push(
			Decoration.mark({
				class: 'cm-lp-wikilink',
				attributes: { 'data-target': link.target.trim() }
			}).range(textFrom, link.to - 2)
		);
		if (hideSyntax && !touches(link.from, link.to)) {
			out.push(hidden.range(link.from, textFrom));
			out.push(hidden.range(link.to - 2, link.to));
		}
	}

	return Decoration.set(out, true);
}

function markdownDecorations(hideSyntax: boolean) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = build(view, hideSyntax);
			}
			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet ||
					update.focusChanged ||
					syntaxTree(update.startState) !== syntaxTree(update.state)
				) {
					this.decorations = build(update.view, hideSyntax);
				}
			}
		},
		{ decorations: (plugin) => plugin.decorations }
	);
}

/** Source editing with reading-view typography; all syntax stays visible. */
export function proseMarkdown(): Extension {
	return markdownDecorations(false);
}

/** Obsidian-style live preview: syntax hidden outside the selection. */
export function livePreview(): Extension {
	return markdownDecorations(true);
}

/** Shared look for both modes, matched to the reading view (`.reading`). */
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
	'.cm-content': { padding: '0 0 40vh 0', caretColor: 'var(--primary)' },
	'.cm-line': { padding: '0' },
	'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)', borderLeftWidth: '2px' },
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
		backgroundColor: 'color-mix(in oklab, var(--primary) 25%, transparent) !important'
	},
	'.cm-lp-h': { fontWeight: '700', letterSpacing: '-0.02em', lineHeight: '1.3' },
	'.cm-lp-h1': { fontSize: '2rem', paddingTop: '1.5rem', paddingBottom: '0.5rem' },
	'.cm-lp-h2': { fontSize: '1.625rem', paddingTop: '1.5rem', paddingBottom: '0.5rem' },
	'.cm-lp-h3': { fontSize: '1.375rem', paddingTop: '1rem', paddingBottom: '0.25rem' },
	'.cm-lp-h4, .cm-lp-h5, .cm-lp-h6': { fontSize: '1.125rem', paddingTop: '1rem' },
	// The first `# Title` line stands in for the header title while editing.
	'.cm-lp-title': { fontSize: '2.25rem', paddingTop: '0', paddingBottom: '1rem' },
	'.cm-lp-strong': { fontWeight: '700' },
	'.cm-lp-em': { fontStyle: 'italic' },
	'.cm-lp-strike': { textDecoration: 'line-through' },
	'.cm-lp-code, .cm-lp-codeblock, .cm-lp-table': {
		fontFamily: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Consolas, monospace",
		fontSize: '0.875em'
	},
	'.cm-lp-code': {
		backgroundColor: 'var(--muted)',
		borderRadius: '4px',
		padding: '0.1em 0.3em'
	},
	'.cm-lp-codeblock': {
		backgroundColor: 'color-mix(in oklab, var(--muted) 60%, transparent)',
		paddingLeft: '1rem !important',
		paddingRight: '1rem !important'
	},
	'.cm-lp-fence': { color: 'var(--muted-foreground)' },
	'.cm-lp-fence-open': {
		borderTopLeftRadius: '8px',
		borderTopRightRadius: '8px',
		paddingTop: '0.5rem'
	},
	'.cm-lp-fence-close': {
		borderBottomLeftRadius: '8px',
		borderBottomRightRadius: '8px',
		paddingBottom: '0.5rem'
	},
	'.cm-lp-quote': {
		borderLeft: '4px solid var(--border)',
		paddingLeft: '1rem !important',
		color: 'var(--muted-foreground)',
		fontStyle: 'italic'
	},
	'.cm-lp-link, .cm-lp-wikilink': { color: 'var(--primary)', cursor: 'pointer' },
	'.cm-lp-wikilink': { textDecoration: 'underline', textUnderlineOffset: '3px' },
	'.cm-lp-bullet': { display: 'inline-block', width: '1ch', color: 'var(--muted-foreground)' },
	'.cm-lp-task': { margin: '0 0.4em 0 0', verticalAlign: '-0.1em', cursor: 'pointer' },
	'.cm-lp-done': { color: 'var(--muted-foreground)', textDecoration: 'line-through' },
	'.cm-lp-hr': {
		display: 'inline-block',
		width: '100%',
		verticalAlign: 'middle',
		borderTop: '1px solid var(--border)'
	}
});

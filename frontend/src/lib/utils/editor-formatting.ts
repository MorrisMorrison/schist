import type { EditorView } from '@codemirror/view';
import type { FormattingType } from '#lib/types/editor.ts';

interface Formatted {
	text: string;
	/** Cursor position relative to the end of `text`; 0 keeps the default selection. */
	cursorOffset: number;
}

/**
 * The markdown a toolbar button or shortcut inserts around (or instead of) the
 * selected text. Without a selection a placeholder is inserted and, for inline
 * formats, the cursor lands inside the markers.
 */
export function formatMarkdown(type: FormattingType, selected: string, value?: string): Formatted {
	switch (type) {
		case 'bold':
			return { text: `**${selected || 'bold text'}**`, cursorOffset: selected ? 0 : -2 };
		case 'italic':
			return { text: `*${selected || 'italic text'}*`, cursorOffset: selected ? 0 : -1 };
		case 'heading1':
			return { text: `# ${selected || 'Heading 1'}`, cursorOffset: 0 };
		case 'heading2':
			return { text: `## ${selected || 'Heading 2'}`, cursorOffset: 0 };
		case 'heading3':
			return { text: `### ${selected || 'Heading 3'}`, cursorOffset: 0 };
		case 'bulletList':
			return { text: `- ${selected || 'List item'}`, cursorOffset: 0 };
		case 'numberedList':
			return { text: `1. ${selected || 'List item'}`, cursorOffset: 0 };
		case 'link': {
			const url = value || 'https://example.com';
			return {
				text: `[${selected || 'link text'}](${url})`,
				cursorOffset: selected ? 0 : -url.length - 1
			};
		}
		case 'wikiLink':
			return { text: `[[${selected || 'Document Name'}]]`, cursorOffset: selected ? 0 : -2 };
		case 'code':
			return { text: `\`${selected || 'code'}\``, cursorOffset: selected ? 0 : -1 };
		case 'quote':
			return { text: `> ${selected || 'Quote'}`, cursorOffset: 0 };
	}
}

/** Applies `formatMarkdown` to the main selection of a CodeMirror view. */
export function applyFormatting(view: EditorView, type: FormattingType, value?: string): void {
	const selection = view.state.selection.main;
	const selected = view.state.doc.sliceString(selection.from, selection.to);
	const { text, cursorOffset } = formatMarkdown(type, selected, value);

	view.dispatch({
		changes: { from: selection.from, to: selection.to, insert: text },
		selection: cursorOffset ? { anchor: selection.from + text.length + cursorOffset } : undefined
	});
	view.focus();
}

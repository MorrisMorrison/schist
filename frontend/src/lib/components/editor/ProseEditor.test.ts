import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { EditorView } from '@codemirror/view';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		uploadImage: vi.fn(),
		getDocuments: vi.fn().mockResolvedValue([]),
		getDocumentByPath: vi.fn(),
		getAllTags: vi.fn().mockResolvedValue({ tags: [] }),
		getAssetUrl: vi.fn((path: string) => path)
	}
}));

import { apiClient } from '#lib/api/client.ts';
import ProseEditor from './ProseEditor.svelte';
import LazyProseEditor from './LazyProseEditor.svelte';

function view(): EditorView {
	const dom = document.querySelector<HTMLElement>('.cm-editor');
	expect(dom).not.toBeNull();
	return EditorView.findFromDOM(dom!)!;
}

const text = () => view().state.doc.toString();

function press(key: string, init: KeyboardEventInit = {}) {
	view().contentDOM.dispatchEvent(
		new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...init })
	);
}

describe('ProseEditor', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('shows the markdown as prose: no gutters, line numbers or fold markers', () => {
		render(ProseEditor, { props: { content: '# Title\n\nBody' } });

		expect(text()).toBe('# Title\n\nBody');
		expect(document.querySelector('.cm-gutters')).toBeNull();
		expect(document.querySelector('.cm-lineNumbers')).toBeNull();
		expect(document.querySelector('.cm-prose-title')).toHaveTextContent('# Title');
	});

	it('reports every change', () => {
		const onContentChange = vi.fn();
		render(ProseEditor, { props: { content: 'a', onContentChange } });

		view().dispatch({ changes: { from: 1, insert: 'b' } });

		expect(onContentChange).toHaveBeenCalledWith('ab');
	});

	it('saves on Ctrl+S', () => {
		const onSave = vi.fn();
		render(ProseEditor, { props: { content: 'a', onSave } });

		press('s');

		expect(onSave).toHaveBeenCalledOnce();
	});

	it.each([
		['b', {}, '**bold text**'],
		['i', {}, '*italic text*'],
		['1', {}, '# Heading 1'],
		['K', { shiftKey: true, keyCode: 75 }, '[[Document Name]]'],
		['`', {}, '`code`']
	] as const)('formats with Ctrl+%s', (key, init, expected) => {
		render(ProseEditor, { props: { content: '' } });

		press(key, init);

		expect(text()).toBe(expected);
	});

	it('formats through formatText and replaces everything through setContent', () => {
		const { component } = render(ProseEditor, { props: { content: 'x' } });
		view().dispatch({ selection: { anchor: 0, head: 1 } });

		component.formatText('italic');
		expect(text()).toBe('*x*');

		component.setContent('# Template');
		expect(text()).toBe('# Template');
	});

	it('starts with the given selection', () => {
		render(ProseEditor, {
			props: { content: '# Title', initialSelection: { anchor: 2, head: 7 } }
		});

		const { from, to } = view().state.selection.main;
		expect(view().state.sliceDoc(from, to)).toBe('Title');
	});

	it('focuses itself when asked to', () => {
		render(ProseEditor, { props: { content: 'x', autofocus: true } });

		expect(view().hasFocus).toBe(true);
	});

	it('uploads a pasted image and reports progress', async () => {
		vi.mocked(apiClient.uploadImage).mockImplementation(async (_file, onProgress) => {
			onProgress?.(50);
			return { path: '/assets/shot.png', original_name: 'shot.png' } as never;
		});
		const onUploadStart = vi.fn();
		const onUploadProgress = vi.fn();
		const onUploadComplete = vi.fn();
		render(ProseEditor, {
			props: { content: '', onUploadStart, onUploadProgress, onUploadComplete }
		});

		const data = new DataTransfer();
		data.items.add(new File(['png'], 'shot.png', { type: 'image/png' }));
		view().contentDOM.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
		);

		await vi.waitFor(() => expect(onUploadComplete).toHaveBeenCalled());
		expect(onUploadStart).toHaveBeenCalled();
		expect(onUploadProgress).toHaveBeenCalledWith(50);
		expect(text()).toMatch(/^!\[shot\.png\]\(\/assets\/shot\.png/);
	});
});

describe('LazyProseEditor', () => {
	afterEach(() => cleanup());

	it('loads the editor and forwards its methods', async () => {
		const { component, getByTestId } = render(LazyProseEditor, { props: { content: 'x' } });
		expect(getByTestId('editor-loading')).toBeInTheDocument();

		await vi.waitFor(() => expect(document.querySelector('.cm-editor')).not.toBeNull());
		component.setContent('y');
		component.formatText('bold');
		component.focus();
		component.remeasure();

		expect(text()).toContain('y');
		expect(text()).toContain('**');
		expect(view().hasFocus).toBe(true);
	});
});

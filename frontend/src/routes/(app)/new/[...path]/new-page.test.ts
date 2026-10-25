import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { EditorView } from '@codemirror/view';

vi.mock('$lib/api/client', () => ({
	apiClient: {
		getTemplates: vi.fn(),
		createDocument: vi.fn(),
		checkDocumentExists: vi.fn().mockResolvedValue(false),
		getDocumentByPath: vi.fn(),
		getDocuments: vi.fn().mockResolvedValue([]),
		getFolderTree: vi.fn().mockResolvedValue([]),
		getAllTags: vi.fn().mockResolvedValue({ tags: [] }),
		getAssetUrl: vi.fn((path: string) => path),
		getSecretsStatus: vi.fn(),
		getSecret: vi.fn()
	}
}));

import { goto } from '$app/navigation';
import { apiClient } from '$lib/api/client';
import { resetAllState } from '$lib/stores/documents.svelte';
import Page from './+page.svelte';

async function editorView(): Promise<EditorView> {
	await vi.waitFor(() => expect(document.querySelector('.cm-editor')).not.toBeNull());
	return EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!;
}

describe('new document page', () => {
	beforeEach(() => {
		vi.mocked(apiClient.getTemplates).mockResolvedValue([
			{
				id: 'meeting',
				title: 'Meeting',
				description: 'Meeting notes',
				content: '# Meeting {{date}}\n\n## Notes',
				tags: []
			}
		] as never);
		vi.mocked(apiClient.createDocument).mockResolvedValue({ path: '/ideas' } as never);
		vi.mocked(apiClient.getDocumentByPath).mockResolvedValue({
			metaData: { title: 'Ideas', path: '/ideas', slug: 'ideas', tags: ['thought'] },
			content: '# Ideas\n\nA #thought'
		} as never);
	});

	afterEach(() => {
		cleanup();
		resetAllState();
		vi.clearAllMocks();
	});

	it('starts in the editor with the placeholder title selected', async () => {
		render(Page, { props: { data: { path: '/' } as never } });

		const view = await editorView();
		expect(view.state.doc.toString()).toBe('# New Document\n\n');
		expect(view.hasFocus).toBe(true);
		const { from, to } = view.state.selection.main;
		expect(view.state.sliceDoc(from, to)).toBe('New Document');
		expect(screen.getByTestId('edit-mode-button')).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByTestId('new-document-path')).toHaveTextContent('/new-document');
	});

	it('previews the draft and comes back to the same editor', async () => {
		render(Page, { props: { data: { path: '/' } as never } });
		const view = await editorView();
		view.dispatch({ changes: { from: view.state.doc.length, insert: 'Some **bold** text' } });

		await fireEvent.click(screen.getByTestId('preview-mode-button'));
		const preview = await screen.findByTestId('markdown-preview');
		await vi.waitFor(() => expect(preview.querySelector('strong')).toHaveTextContent('bold'));

		await fireEvent.click(screen.getByTestId('edit-mode-button'));
		expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument();
		expect(await editorView()).toBe(view);
	});

	it('applies a template to the editor', async () => {
		render(Page, { props: { data: { path: '/' } as never } });
		const view = await editorView();

		await fireEvent.click(await screen.findByRole('button', { name: /Meeting/ }));

		expect(view.state.doc.toString()).toMatch(/^# Meeting \d{4}-\d{2}-\d{2}\n\n## Notes$/);
	});

	it('creates the document from the editor text and opens it', async () => {
		render(Page, { props: { data: { path: '/' } as never } });
		const view = await editorView();
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: '# Ideas\n\nA #thought' }
		});

		await fireEvent.click(screen.getByTestId('save-document-button'));

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/documents/ideas'));
		expect(apiClient.createDocument).toHaveBeenCalledWith({
			metaData: { path: '/ideas', title: 'Ideas', tags: ['thought'] },
			content: '# Ideas\n\nA #thought'
		});
	});
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { EditorView } from '@codemirror/view';
import type { Document } from '$lib/api/types';

vi.mock('$lib/api/client', () => ({
	apiClient: {
		updateDocumentByPath: vi.fn(),
		checkDocumentExists: vi.fn(),
		getDocuments: vi.fn().mockResolvedValue([]),
		getFolderTree: vi.fn().mockResolvedValue([]),
		getDocumentByPath: vi.fn(),
		getAllTags: vi.fn().mockResolvedValue({ tags: [] }),
		getAssetUrl: vi.fn((path: string) => path),
		uploadImage: vi.fn()
	}
}));

import { apiClient } from '$lib/api/client';
import { resetAllState } from '$lib/stores/documents.svelte';
import { settingsActions } from '$lib/stores/settings.svelte';
import DocumentInlineEditor from './DocumentInlineEditor.svelte';

const doc: Document = {
	metaData: {
		title: 'Plan',
		path: '/notes/plan',
		slug: 'plan',
		created: '2024-01-01T00:00:00Z',
		updated: '2024-01-02T00:00:00Z',
		tags: []
	},
	content: '# Plan\n\nHello'
};

async function editorView(): Promise<EditorView> {
	await vi.waitFor(() => expect(document.querySelector('.cm-editor')).not.toBeNull());
	return EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!;
}

async function type(insert: string) {
	const view = await editorView();
	view.dispatch({ changes: { from: view.state.doc.length, insert } });
}

describe('DocumentInlineEditor', () => {
	beforeEach(() => {
		vi.mocked(apiClient.updateDocumentByPath).mockImplementation(async (_path, request) => ({
			metaData: { ...doc.metaData, ...request.metaData },
			content: request.content
		}));
		vi.mocked(apiClient.checkDocumentExists).mockResolvedValue(false);
	});

	afterEach(() => {
		cleanup();
		resetAllState();
		settingsActions.updateAppSetting('alwaysOpenFullscreen', false);
		localStorage.removeItem('schist_settings');
		vi.clearAllMocks();
	});

	it('edits the document text in place, starting out saved', async () => {
		render(DocumentInlineEditor, { props: { document: doc } });

		expect((await editorView()).state.doc.toString()).toBe('# Plan\n\nHello');
		expect(screen.getByTestId('save-status')).toHaveTextContent('Saved');
		expect(screen.getByRole('toolbar', { name: 'Formatting toolbar' })).toBeInTheDocument();
	});

	it('shows unsaved changes, then saves through save() and reports the stored document', async () => {
		const onSaved = vi.fn();
		const { component } = render(DocumentInlineEditor, { props: { document: doc, onSaved } });

		await type(' world');
		expect(await screen.findByTestId('unsaved-indicator')).toBeInTheDocument();
		expect(component.isDirty()).toBe(true);

		expect(await component.save()).toBe(true);

		expect(apiClient.updateDocumentByPath).toHaveBeenCalledWith(
			'notes/plan',
			expect.objectContaining({ content: '# Plan\n\nHello world' }),
			'manual'
		);
		expect(onSaved).toHaveBeenCalledWith(
			expect.objectContaining({ content: '# Plan\n\nHello world' })
		);
		expect(await screen.findByTestId('auto-saved')).toBeInTheDocument();
	});

	it('saves on Ctrl+S inside the editor', async () => {
		render(DocumentInlineEditor, { props: { document: doc } });
		await type('!');

		(await editorView()).contentDOM.dispatchEvent(
			new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
		);

		await vi.waitFor(() => expect(apiClient.updateDocumentByPath).toHaveBeenCalled());
	});

	it('shows a failed save and stays dirty', async () => {
		vi.mocked(apiClient.updateDocumentByPath).mockRejectedValue(new Error('disk full'));
		const { component } = render(DocumentInlineEditor, { props: { document: doc } });
		await type('!');

		expect(await component.save()).toBe(false);

		expect(await screen.findByText('disk full')).toBeInTheDocument();
		expect(component.isDirty()).toBe(true);
	});

	it('warns while the title would rename onto an existing document', async () => {
		vi.mocked(apiClient.checkDocumentExists).mockResolvedValue(true);
		render(DocumentInlineEditor, { props: { document: doc } });
		const view = await editorView();

		view.dispatch({ changes: { from: 2, to: 6, insert: 'Taken' } });

		expect(
			await screen.findByText(/already exists at "notes\/taken"/, {}, { timeout: 3000 })
		).toBeInTheDocument();
	});

	it('enters and leaves focus mode with the toolbar button, F11 and Escape', async () => {
		render(DocumentInlineEditor, { props: { document: doc } });
		await editorView();
		const shell = screen.getByTestId('document-editor');

		await fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
		expect(shell).toHaveAttribute('aria-modal', 'true');

		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(shell).not.toHaveAttribute('aria-modal');

		await fireEvent.keyDown(window, { key: 'F11' });
		expect(shell).toHaveAttribute('aria-modal', 'true');
		await fireEvent.keyDown(window, { key: 'F11' });
		expect(shell).not.toHaveAttribute('aria-modal');
	});

	it('starts in focus mode when the setting says so', async () => {
		settingsActions.updateAppSetting('alwaysOpenFullscreen', true);
		render(DocumentInlineEditor, { props: { document: doc } });

		expect(screen.getByTestId('document-editor')).toHaveAttribute('aria-modal', 'true');
	});

	it('discardChanges forgets the draft without saving', async () => {
		const { component } = render(DocumentInlineEditor, { props: { document: doc } });
		await type('!');

		component.discardChanges();

		expect(component.isDirty()).toBe(false);
		expect(apiClient.updateDocumentByPath).not.toHaveBeenCalled();
	});

	it('applies toolbar formatting to the editor', async () => {
		render(DocumentInlineEditor, { props: { document: doc } });
		const view = await editorView();
		view.dispatch({ selection: { anchor: view.state.doc.length } });

		await fireEvent.click(screen.getByRole('button', { name: 'Bold' }));

		expect(view.state.doc.toString()).toBe('# Plan\n\nHello**bold text**');
	});
});

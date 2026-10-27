import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { waitForDialogFocus } from '#lib/test/dialog.ts';
import { documentActions } from '#lib/stores/documents.svelte.ts';
import type { Document, UpdateDocumentRequest } from '#lib/api/types.ts';
import RenameDocumentModal from './RenameDocumentModal.svelte';

vi.mock('#lib/stores/documents.svelte.ts', () => ({
	documentActions: { checkDocumentExists: vi.fn(), updateDocumentByPath: vi.fn() }
}));

const doc: Document = {
	metaData: { title: 'Old Title', path: '/notes/old-title', slug: 'old-title', tags: ['a'] },
	content: '# Old Title\n\nBody'
};

describe('RenameDocumentModal', () => {
	const onClose = vi.fn();
	const onRenamed = vi.fn();

	async function renderModal(props: Record<string, unknown> = {}) {
		const result = render(RenameDocumentModal, {
			props: { document: doc, open: true, onClose, onRenamed, ...props }
		});
		if (screen.queryByRole('dialog')) await waitForDialogFocus();
		return result;
	}

	function titleInput() {
		return screen.getByTestId('document-name');
	}

	function renameButton() {
		return screen.getByTestId('rename-document-btn');
	}

	beforeEach(() => {
		vi.mocked(documentActions.checkDocumentExists).mockResolvedValue(false);
		vi.mocked(documentActions.updateDocumentByPath).mockImplementation(
			async (_path: string, req: UpdateDocumentRequest) =>
				({ metaData: req.metaData, content: req.content }) as Document
		);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('prefills the current title and disables rename until it changes', async () => {
		await renderModal();
		expect(titleInput()).toHaveValue('Old Title');
		expect(screen.getAllByText('Old Title').length).toBeGreaterThan(0);
		expect(renameButton()).toBeDisabled();

		await userEvent.clear(titleInput());
		expect(renameButton()).toBeDisabled();
		await userEvent.type(titleInput(), 'x'.repeat(101));
		expect(renameButton()).toBeDisabled();
	});

	it('renames to a new slug and reports old and new paths', async () => {
		await renderModal();
		await userEvent.clear(titleInput());
		await userEvent.type(titleInput(), 'New Title{Enter}');

		expect(documentActions.checkDocumentExists).toHaveBeenCalledWith('/notes/new-title');
		expect(documentActions.updateDocumentByPath).toHaveBeenCalledWith('/notes/old-title', {
			metaData: {
				...doc.metaData,
				title: 'New Title',
				slug: 'new-title',
				path: '/notes/new-title'
			},
			content: doc.content
		});
		await vi.waitFor(() =>
			expect(onRenamed).toHaveBeenCalledWith('/notes/old-title', '/notes/new-title')
		);
	});

	it('skips the existence check when only the title casing changes', async () => {
		await renderModal();
		await userEvent.clear(titleInput());
		await userEvent.type(titleInput(), 'old title');
		await userEvent.click(renameButton());
		expect(documentActions.checkDocumentExists).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(onRenamed).toHaveBeenCalled());
	});

	it('refuses to overwrite an existing document', async () => {
		vi.mocked(documentActions.checkDocumentExists).mockResolvedValue(true);
		await renderModal();
		await userEvent.clear(titleInput());
		await userEvent.type(titleInput(), 'Taken');
		await userEvent.click(renameButton());
		expect(
			await screen.findByText(/A document already exists at "\/notes\/taken"/)
		).toBeInTheDocument();
		expect(documentActions.updateDocumentByPath).not.toHaveBeenCalled();
		expect(onRenamed).not.toHaveBeenCalled();
	});

	it('shows the error when the update fails', async () => {
		vi.mocked(documentActions.updateDocumentByPath).mockRejectedValue(
			new Error(JSON.stringify({ error: 'Disk full' }))
		);
		await renderModal();
		await userEvent.clear(titleInput());
		await userEvent.type(titleInput(), 'Another');
		await userEvent.click(renameButton());
		expect(await screen.findByText('Disk full')).toBeInTheDocument();
		expect(onRenamed).not.toHaveBeenCalled();
	});

	it('shows a renaming state and blocks closing while saving', async () => {
		let resolve!: (d: Document) => void;
		vi.mocked(documentActions.updateDocumentByPath).mockReturnValue(
			new Promise((r) => (resolve = r))
		);
		await renderModal();
		await userEvent.clear(titleInput());
		await userEvent.type(titleInput(), 'Slow');
		await userEvent.click(renameButton());
		expect(renameButton()).toHaveTextContent('Renaming...');
		await userEvent.keyboard('{Escape}');
		expect(onClose).not.toHaveBeenCalled();
		resolve({ metaData: { title: 'Slow', path: '/notes/slow' }, content: '' } as Document);
		await vi.waitFor(() =>
			expect(onRenamed).toHaveBeenCalledWith('/notes/old-title', '/notes/slow')
		);
	});

	it('closes from Cancel', async () => {
		await renderModal();
		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

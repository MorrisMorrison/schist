import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { waitForDialogFocus, selectFiles } from '$lib/test/dialog';
import { apiClient } from '$lib/api/client';
import { folderActions, documentActions } from '$lib/stores/documents.svelte';
import type { Folder, ImportResult } from '$lib/api/types';
import ImportDocumentsModal from './ImportDocumentsModal.svelte';

vi.mock('$lib/api/client', () => ({
	apiClient: { importDocuments: vi.fn() }
}));

vi.mock('$lib/stores/documents.svelte', () => ({
	folderActions: { loadFolderTree: vi.fn() },
	documentActions: { loadDocuments: vi.fn() }
}));

const folders: Folder[] = [
	{
		name: 'notes',
		path: '/notes',
		created: '',
		document_count: 1,
		sub_folders: [
			{ name: 'daily', path: '/notes/daily', created: '', document_count: 0, sub_folders: [] }
		]
	},
	{ name: 'work', path: '/work', created: '', document_count: 0, sub_folders: [] }
];

function result(overrides: Partial<ImportResult> = {}): ImportResult {
	return {
		success: [],
		failed: [],
		skipped: [],
		total_files: 0,
		imported_count: 0,
		failed_count: 0,
		skipped_count: 0,
		...overrides
	};
}

function mdFile(name: string) {
	return new File(['# hi'], name, { type: 'text/markdown' });
}

describe('ImportDocumentsModal', () => {
	const onClose = vi.fn();
	const onSuccess = vi.fn();

	async function renderModal() {
		const result = render(ImportDocumentsModal, {
			props: { open: true, onClose, onSuccess, folders }
		});
		if (screen.queryByRole('dialog')) await waitForDialogFocus();
		return result;
	}

	function fileInput() {
		return screen.getByLabelText('Select Markdown Files') as HTMLInputElement;
	}

	function importButton() {
		return screen.getByRole('button', { name: /import documents/i });
	}

	beforeEach(() => {
		vi.mocked(folderActions.loadFolderTree).mockResolvedValue(undefined as never);
		vi.mocked(documentActions.loadDocuments).mockResolvedValue(undefined as never);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('lists the folder tree as import targets', async () => {
		await renderModal();
		const select = screen.getByLabelText('Import to Folder');
		const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
		expect(labels).toEqual(['Root', '/notes', '/notes/daily', '/work']);
	});

	it('keeps import disabled until markdown files are selected', async () => {
		await renderModal();
		expect(importButton()).toBeDisabled();

		selectFiles(fileInput(), [mdFile('a.md')]);
		expect(await screen.findByText('Selected: a.md')).toBeInTheDocument();
		expect(importButton()).toBeEnabled();

		selectFiles(fileInput(), [mdFile('a.md'), mdFile('b.MD')]);
		expect(await screen.findByText('Selected: 2 files')).toBeInTheDocument();
		expect(importButton()).toBeEnabled();
	});

	it('rejects a selection with non-markdown files', async () => {
		await renderModal();
		selectFiles(fileInput(), [mdFile('a.md'), new File(['x'], 'b.txt')]);
		expect(await screen.findByText('Selected: 2 files')).toBeInTheDocument();
		expect(importButton()).toBeDisabled();
	});

	it('imports with the chosen folder and overwrite mode, reloads and reports success', async () => {
		vi.mocked(apiClient.importDocuments).mockResolvedValue(
			result({
				total_files: 2,
				imported_count: 1,
				skipped_count: 1,
				success: [{ title: 'Alpha', final_path: '/work/alpha' } as never],
				skipped: [{ title: 'Beta', final_path: '/work/beta' } as never]
			})
		);
		await renderModal();
		selectFiles(fileInput(), [mdFile('alpha.md')]);
		await userEvent.selectOptions(screen.getByLabelText('Import to Folder'), '/work');
		await userEvent.click(screen.getByLabelText('Overwrite'));
		await userEvent.click(importButton());

		const call = vi.mocked(apiClient.importDocuments).mock.calls[0];
		expect(call[0]).toHaveLength(1);
		expect(call[0][0].name).toBe('alpha.md');
		expect(call[1]).toEqual({ target_path: '/work', overwrite_mode: 'overwrite' });

		expect(await screen.findByText('Import Summary')).toBeInTheDocument();
		expect(screen.getByText('Successfully Imported')).toBeInTheDocument();
		expect(screen.getByText('Alpha')).toBeInTheDocument();
		expect(screen.getByText('Skipped Files')).toBeInTheDocument();
		expect(screen.getByText(/already exists/)).toBeInTheDocument();
		expect(folderActions.loadFolderTree).toHaveBeenCalled();
		expect(documentActions.loadDocuments).toHaveBeenCalled();

		await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1), { timeout: 3000 });

		await userEvent.click(screen.getByRole('button', { name: 'Done' }));
		expect(onClose).toHaveBeenCalled();
	});

	it('lists failures, skips the reload when nothing was imported and does not auto-close', async () => {
		vi.mocked(apiClient.importDocuments).mockResolvedValue(
			result({
				total_files: 1,
				failed_count: 1,
				failed: [{ original_name: 'bad.md', error: 'invalid front matter' } as never]
			})
		);
		await renderModal();
		selectFiles(fileInput(), [mdFile('bad.md')]);
		await userEvent.click(screen.getByLabelText('Skip'));
		await userEvent.click(importButton());

		expect(vi.mocked(apiClient.importDocuments).mock.calls[0][1]).toEqual({
			target_path: '/',
			overwrite_mode: 'skip'
		});
		expect(await screen.findByText('Failed to Import')).toBeInTheDocument();
		expect(screen.getByText('invalid front matter')).toBeInTheDocument();
		expect(folderActions.loadFolderTree).not.toHaveBeenCalled();
		// The footer offers "Close" (not "Done") when something failed.
		expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
		expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
		expect(onSuccess).not.toHaveBeenCalled();
	});

	it('shows the API error message when the import fails', async () => {
		vi.mocked(apiClient.importDocuments).mockRejectedValue(
			new Error(JSON.stringify({ error: 'Upload too large' }))
		);
		await renderModal();
		selectFiles(fileInput(), [mdFile('a.md')]);
		await userEvent.click(importButton());
		expect(await screen.findByText('Upload too large')).toBeInTheDocument();
		expect(importButton()).toBeEnabled();
	});

	it('shows progress while importing', async () => {
		let resolve!: (r: ImportResult) => void;
		vi.mocked(apiClient.importDocuments).mockReturnValue(new Promise((r) => (resolve = r)));
		await renderModal();
		selectFiles(fileInput(), [mdFile('a.md')]);
		await userEvent.click(importButton());
		expect(screen.getByRole('button', { name: /importing/i })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
		resolve(result({ failed_count: 1 }));
		expect(await screen.findByText('Import Summary')).toBeInTheDocument();
	});

	it('closes from Cancel and Escape', async () => {
		await renderModal();
		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onClose).toHaveBeenCalledTimes(1);
		await userEvent.keyboard('{Escape}');
		expect(onClose).toHaveBeenCalledTimes(2);
	});
});

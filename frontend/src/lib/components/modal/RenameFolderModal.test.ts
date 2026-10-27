import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { waitForDialogFocus } from '#lib/test/dialog.ts';
import { folderActions } from '#lib/stores/documents.svelte.ts';
import type { Folder } from '#lib/api/types.ts';
import RenameFolderModal from './RenameFolderModal.svelte';

vi.mock('#lib/stores/documents.svelte.ts', () => ({
	folderActions: { renameFolder: vi.fn() }
}));

const nested: Folder = {
	name: 'old',
	path: '/projects/old',
	created: '',
	document_count: 0,
	sub_folders: []
};
const topLevel: Folder = { ...nested, name: 'top', path: '/top' };

describe('RenameFolderModal', () => {
	const onClose = vi.fn();
	const onRenamed = vi.fn();

	async function renderModal(folder: Folder = nested) {
		const result = render(RenameFolderModal, { props: { folder, open: true, onClose, onRenamed } });
		if (screen.queryByRole('dialog')) await waitForDialogFocus();
		return result;
	}

	function nameInput() {
		return screen.getByTestId('folder-name');
	}

	function renameButton() {
		return screen.getByTestId('rename-folder-btn');
	}

	beforeEach(() => {
		vi.mocked(folderActions.renameFolder).mockResolvedValue(undefined as never);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('prefills the name, shows paths, and needs a changed valid name', async () => {
		await renderModal();
		expect(nameInput()).toHaveValue('old');
		// Current path and (unchanged) new path.
		expect(screen.getAllByText('/projects/old')).toHaveLength(2);
		expect(renameButton()).toBeDisabled();

		await userEvent.clear(nameInput());
		await userEvent.type(nameInput(), 'bad.name');
		expect(renameButton()).toBeDisabled();
		await userEvent.clear(nameInput());
		await userEvent.type(nameInput(), 'n'.repeat(51));
		expect(renameButton()).toBeDisabled();
		await userEvent.clear(nameInput());
		expect(renameButton()).toBeDisabled();

		await userEvent.type(nameInput(), 'fresh');
		expect(screen.getByText('/projects/fresh')).toBeInTheDocument();
		expect(renameButton()).toBeEnabled();
	});

	it('builds the new path at the root for a top-level folder', async () => {
		await renderModal(topLevel);
		await userEvent.clear(nameInput());
		await userEvent.type(nameInput(), 'renamed');
		expect(screen.getByText('/renamed')).toBeInTheDocument();
	});

	it('renames with a normalised name on Enter', async () => {
		await renderModal();
		await userEvent.clear(nameInput());
		await userEvent.type(nameInput(), 'My New Name{Enter}');
		expect(folderActions.renameFolder).toHaveBeenCalledWith('/projects/old', 'my-new-name');
		await vi.waitFor(() => expect(onRenamed).toHaveBeenCalledTimes(1));
	});

	it('shows the error when renaming fails', async () => {
		vi.mocked(folderActions.renameFolder).mockRejectedValue(
			new Error(JSON.stringify({ error: 'Folder exists' }))
		);
		await renderModal();
		await userEvent.clear(nameInput());
		await userEvent.type(nameInput(), 'taken');
		await userEvent.click(renameButton());
		expect(await screen.findByText('Folder exists')).toBeInTheDocument();
		expect(onRenamed).not.toHaveBeenCalled();
	});

	it('does not call onClose while renaming', async () => {
		let resolve!: () => void;
		vi.mocked(folderActions.renameFolder).mockReturnValue(
			new Promise<void>((r) => (resolve = r)) as never
		);
		await renderModal();
		await userEvent.clear(nameInput());
		await userEvent.type(nameInput(), 'slow');
		await userEvent.click(renameButton());
		expect(renameButton()).toHaveTextContent('Renaming...');
		expect(screen.getByTestId('cancel-rename-folder-btn')).toBeDisabled();
		await userEvent.keyboard('{Escape}');
		expect(onClose).not.toHaveBeenCalled();
		resolve();
		await vi.waitFor(() => expect(onRenamed).toHaveBeenCalled());
		expect(onClose).not.toHaveBeenCalled();
	});

	it('closes from Cancel', async () => {
		await renderModal();
		await userEvent.click(screen.getByTestId('cancel-rename-folder-btn'));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

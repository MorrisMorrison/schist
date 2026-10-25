import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { waitForDialogFocus } from '$lib/test/dialog';
import { folderActions } from '$lib/stores/documents.svelte';
import CreateFolderModal from './CreateFolderModal.svelte';

vi.mock('$lib/stores/documents.svelte', () => ({
	folderActions: { createFolder: vi.fn() }
}));

describe('CreateFolderModal', () => {
	const onClose = vi.fn();
	const onCreated = vi.fn();

	async function renderModal(props: Record<string, unknown> = {}) {
		const result = render(CreateFolderModal, { props: { onClose, onCreated, ...props } });
		if (screen.queryByRole('dialog')) await waitForDialogFocus();
		return result;
	}

	beforeEach(() => {
		vi.mocked(folderActions.createFolder).mockResolvedValue(undefined as never);
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('renders with the create button disabled until a name is entered', async () => {
		await renderModal();
		expect(screen.getByTestId('create-folder-modal')).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: /create new folder/i })).toBeInTheDocument();
		expect(screen.getByTestId('create-folder-btn')).toBeDisabled();

		await userEvent.type(screen.getByTestId('folder-name'), 'Notes');
		expect(screen.getByTestId('create-folder-btn')).toBeEnabled();
		expect(screen.getByText('/Notes')).toBeInTheDocument();
	});

	it('rejects names with invalid characters, blanks or over 50 characters', async () => {
		await renderModal();
		const input = screen.getByTestId('folder-name');
		await userEvent.type(input, 'bad/name');
		expect(screen.getByTestId('create-folder-btn')).toBeDisabled();

		await userEvent.clear(input);
		await userEvent.type(input, 'a'.repeat(51));
		expect(screen.getByTestId('create-folder-btn')).toBeDisabled();

		await userEvent.clear(input);
		await userEvent.type(input, '   ');
		expect(screen.getByTestId('create-folder-btn')).toBeDisabled();
	});

	it('shows the parent folder and builds the path under it', async () => {
		await renderModal({ parentPath: '/projects' });
		expect(screen.getByText('Parent folder:')).toBeInTheDocument();
		await userEvent.type(screen.getByTestId('folder-name'), 'Sub');
		expect(screen.getByText('/projects/Sub')).toBeInTheDocument();
	});

	it('creates a normalised folder path on Enter and calls onCreated', async () => {
		await renderModal({ parentPath: '/projects' });
		await userEvent.type(screen.getByTestId('folder-name'), 'My Folder{Enter}');
		expect(folderActions.createFolder).toHaveBeenCalledWith('/projects/my-folder');
		await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
	});

	it('creates a root folder when the parent is "/"', async () => {
		await renderModal({ parentPath: '/' });
		await userEvent.type(screen.getByTestId('folder-name'), 'Top');
		await userEvent.click(screen.getByTestId('create-folder-btn'));
		expect(folderActions.createFolder).toHaveBeenCalledWith('/top');
	});

	it('shows the API error and does not call onCreated when creation fails', async () => {
		vi.mocked(folderActions.createFolder).mockRejectedValue(
			new Error(JSON.stringify({ error: 'Folder already exists', code: 'RESOURCE_ALREADY_EXISTS' }))
		);
		await renderModal();
		await userEvent.type(screen.getByTestId('folder-name'), 'Dup');
		await userEvent.click(screen.getByTestId('create-folder-btn'));
		expect(await screen.findByRole('alert')).toBeInTheDocument();
		expect(onCreated).not.toHaveBeenCalled();
		expect(screen.getByTestId('create-folder-btn')).toBeEnabled();
	});

	it('shows a loading state while creating', async () => {
		let resolve!: () => void;
		vi.mocked(folderActions.createFolder).mockReturnValue(
			new Promise<void>((r) => (resolve = r)) as never
		);
		await renderModal();
		await userEvent.type(screen.getByTestId('folder-name'), 'Slow');
		await userEvent.click(screen.getByTestId('create-folder-btn'));
		expect(screen.getByTestId('create-folder-btn')).toHaveTextContent('Creating...');
		expect(screen.getByTestId('cancel-create-folder-btn')).toBeDisabled();
		resolve();
		await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());
	});

	it('calls onClose from the cancel button and on Escape', async () => {
		await renderModal();
		await userEvent.click(screen.getByTestId('cancel-create-folder-btn'));
		expect(onClose).toHaveBeenCalledTimes(1);

		await userEvent.keyboard('{Escape}');
		expect(onClose).toHaveBeenCalledTimes(2);
	});

	it('renders nothing when closed', async () => {
		await renderModal({ open: false });
		expect(screen.queryByTestId('create-folder-modal')).not.toBeInTheDocument();
	});
});

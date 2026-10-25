import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { apiClient } from '$lib/api/client';
import { resetAllState, documentsStore } from '$lib/stores/documents.svelte';
import type { Document } from '$lib/api/types';
import { waitForDialogFocus } from '$lib/test/dialog';
import FolderView from './FolderView.svelte';

vi.mock('$lib/api/client', () => ({
	apiClient: {
		getFolderTree: vi.fn(),
		getDocuments: vi.fn(),
		createFolder: vi.fn()
	}
}));

function doc(path: string, title: string, created: string, updated?: string): Document {
	return {
		metaData: { title, path, slug: path.split('/').pop(), created, updated },
		content: ''
	};
}

const docs: Document[] = [
	doc('/beta', 'Beta', '2024-01-02T00:00:00Z', '2024-03-01T00:00:00Z'),
	doc('/alpha', 'Alpha', '2024-01-03T00:00:00Z'),
	doc('/gamma', 'Gamma', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z'),
	doc('/projects/plan', 'Plan', '2024-01-01T00:00:00Z'),
	doc('/projects/deep/inner', 'Inner', '2024-01-01T00:00:00Z')
];

function cardTitles() {
	return screen
		.getAllByTestId('document-card')
		.map((c) => within(c).getByRole('heading').textContent!.trim());
}

describe('FolderView', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(apiClient.getFolderTree).mockResolvedValue([]);
		vi.mocked(apiClient.getDocuments).mockResolvedValue(docs);
	});

	afterEach(() => {
		cleanup();
		resetAllState();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('loads data and lists the root documents sorted by name', async () => {
		render(FolderView, { props: { path: '' } });
		expect(screen.getByRole('heading', { level: 1, name: 'root' })).toBeInTheDocument();
		await screen.findByTestId('documents-section');
		expect(apiClient.getFolderTree).toHaveBeenCalled();
		expect(apiClient.getDocuments).toHaveBeenCalled();
		expect(cardTitles()).toEqual(['Alpha', 'Beta', 'Gamma']);
		expect(screen.getByText('3 documents')).toBeInTheDocument();
	});

	it('toggles the sort order and sorts by created / modified', async () => {
		render(FolderView, { props: { path: '/' } });
		await screen.findByTestId('documents-section');

		await userEvent.click(screen.getByTitle('Sort descending'));
		expect(cardTitles()).toEqual(['Gamma', 'Beta', 'Alpha']);
		await userEvent.click(screen.getByTitle('Sort ascending'));

		await userEvent.selectOptions(screen.getByLabelText('Sort by:'), 'created');
		expect(cardTitles()).toEqual(['Gamma', 'Beta', 'Alpha']);

		await userEvent.selectOptions(screen.getByLabelText('Sort by:'), 'modified');
		expect(cardTitles()).toEqual(['Alpha', 'Gamma', 'Beta']);
	});

	it('shows only direct children of a sub-folder with a humanised title', async () => {
		render(FolderView, { props: { path: '/projects' } });
		await screen.findByTestId('documents-section');
		expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
		expect(cardTitles()).toEqual(['Plan']);
		expect(screen.getByText('1 document')).toBeInTheDocument();
	});

	it('shows an empty folder message', async () => {
		render(FolderView, { props: { path: '/my-empty-folder' } });
		await waitFor(() => expect(apiClient.getDocuments).toHaveBeenCalled());
		expect(screen.getByRole('heading', { level: 1, name: 'My empty folder' })).toBeInTheDocument();
		expect(await screen.findByText('This folder is empty')).toBeInTheDocument();
	});

	it('shows the welcome message for an empty root', async () => {
		vi.mocked(apiClient.getDocuments).mockResolvedValue([]);
		render(FolderView, { props: { path: '' } });
		expect(await screen.findByText('Welcome to your documentation')).toBeInTheDocument();
	});

	it('lists recent documents by modification time, limited', async () => {
		render(FolderView, { props: { mode: 'recent', recentLimit: 3 } });
		expect(screen.getByRole('heading', { level: 1, name: 'Recent Documents' })).toBeInTheDocument();
		await screen.findByTestId('documents-section');
		expect(cardTitles()).toEqual(['Beta', 'Gamma', 'Alpha']);
		expect(screen.getByText(/Showing 3 of 5 documents/)).toBeInTheDocument();
	});

	it('shows the recent empty state', async () => {
		vi.mocked(apiClient.getDocuments).mockResolvedValue([]);
		render(FolderView, { props: { mode: 'recent' } });
		expect(await screen.findByText('No recent activity')).toBeInTheDocument();
		expect(screen.getByText('No documents found')).toBeInTheDocument();
	});

	it('lists all documents in "all" mode without reordering the store', async () => {
		render(FolderView, { props: { mode: 'all' } });
		expect(screen.getByRole('heading', { level: 1, name: 'All Documents' })).toBeInTheDocument();
		await screen.findByTestId('documents-section');
		expect(screen.getByText('5 documents total')).toBeInTheDocument();
		expect(cardTitles()).toEqual(['Alpha', 'Beta', 'Gamma', 'Inner', 'Plan']);
		expect(documentsStore.documents.map((d) => d.metaData.title)).toEqual(
			docs.map((d) => d.metaData.title)
		);
	});

	it('shows the "all" empty state', async () => {
		vi.mocked(apiClient.getDocuments).mockResolvedValue([]);
		render(FolderView, { props: { mode: 'all' } });
		expect(await screen.findByText('No documents yet')).toBeInTheDocument();
	});

	it('navigates to the new-document page for the current folder', async () => {
		render(FolderView, { props: { path: '/projects' } });
		await userEvent.click(screen.getByTestId('create-document'));
		expect(goto).toHaveBeenCalledWith('/new/projects');
	});

	it('creates a folder from the header and reloads', async () => {
		vi.mocked(apiClient.createFolder).mockResolvedValue(undefined as never);
		render(FolderView, { props: { path: '/projects' } });
		await waitFor(() => expect(apiClient.getFolderTree).toHaveBeenCalledTimes(1));

		await userEvent.click(screen.getByTestId('create-folder-header'));
		const modal = await screen.findByTestId('create-folder-modal');
		await waitForDialogFocus();
		await userEvent.type(within(modal).getByTestId('folder-name'), 'Sub');
		await userEvent.click(within(modal).getByTestId('create-folder-btn'));

		expect(apiClient.createFolder).toHaveBeenCalledWith('/projects/sub');
		await waitFor(() =>
			expect(screen.queryByTestId('create-folder-modal')).not.toBeInTheDocument()
		);
		// Initial load, the store's reload after create, and the view's reload.
		await waitFor(() => expect(apiClient.getFolderTree).toHaveBeenCalledTimes(3));
	});

	it('opens the create-folder modal from the empty state and cancels it', async () => {
		vi.mocked(apiClient.getDocuments).mockResolvedValue([]);
		render(FolderView, { props: { path: '' } });
		await userEvent.click(await screen.findByTestId('create-folder-empty'));
		await waitForDialogFocus();
		await userEvent.click(screen.getByTestId('cancel-create-folder-btn'));
		await waitFor(() =>
			expect(screen.queryByTestId('create-folder-modal')).not.toBeInTheDocument()
		);
	});

	it('hides the create buttons when disabled', async () => {
		vi.mocked(apiClient.getDocuments).mockResolvedValue([]);
		render(FolderView, { props: { path: '', showCreateButtons: false } });
		await screen.findByTestId('empty-folder-message');
		expect(screen.queryByTestId('create-document')).not.toBeInTheDocument();
		expect(screen.queryByTestId('create-folder-empty')).not.toBeInTheDocument();
	});

	it('shows a loading indicator while loading and logs failures', async () => {
		let reject!: (e: Error) => void;
		vi.mocked(apiClient.getFolderTree).mockReturnValue(new Promise((_, r) => (reject = r)));
		render(FolderView, { props: { path: '' } });
		expect(screen.getByText('Loading...')).toBeInTheDocument();
		reject(new Error('down'));
		await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
		expect(console.error).toHaveBeenCalledWith('Failed to load folder data:', expect.any(Error));
	});

	it('turns on multi-select mode with the toggle', async () => {
		render(FolderView, { props: { path: '' } });
		const section = await screen.findByTestId('documents-section');
		const toggle = within(section).getAllByRole('switch')[0];
		expect(toggle).toHaveAttribute('aria-checked', 'false');
		await userEvent.click(toggle);
		expect(within(section).getAllByRole('switch')[0]).toHaveAttribute('aria-checked', 'true');
	});
});

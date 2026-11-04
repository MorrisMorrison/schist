import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { apiClient } from '#lib/api/client.ts';
import { resetAllState } from '#lib/stores/documents.svelte.ts';
import type { DocumentSummary, Folder } from '#lib/api/types.ts';
import { waitForDialogFocus, waitForPointerEvents } from '#lib/test/dialog.ts';
import { chooseSelectOption } from '#lib/test/select.ts';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		getFolderTree: vi.fn(),
		getDocuments: vi.fn(),
		createFolder: vi.fn(),
		deleteDocumentByPath: vi.fn()
	}
}));
vi.mock('#lib/utils/pins.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/utils/pins.ts')>()),
	setPinned: vi.fn().mockResolvedValue(undefined)
}));

import { setPinned } from '#lib/utils/pins.ts';
import FolderView from './FolderView.svelte';

function doc(
	path: string,
	title: string,
	created: string,
	updated?: string,
	extra: Partial<DocumentSummary['metaData']> = {}
): DocumentSummary {
	return {
		metaData: { title, path, slug: path.split('/').pop()!, created, updated, ...extra }
	} as DocumentSummary;
}

const docs = [
	doc('/beta', 'Beta', '2024-01-02T00:00:00Z', '2024-03-01T00:00:00Z', {
		tags: ['one', 'two', 'three']
	}),
	doc('/alpha', 'Alpha', '2024-01-03T00:00:00Z', '2024-01-03T00:00:00Z', {
		properties: { pinned: true }
	}),
	doc('/gamma', 'Gamma', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z'),
	doc('/projects/plan', 'Plan', '2024-01-01T00:00:00Z', '2024-04-01T00:00:00Z'),
	doc('/projects/deep/inner', 'Inner', '2024-01-01T00:00:00Z', '2024-05-01T00:00:00Z')
];

const tree: Folder[] = [
	{
		name: 'projects',
		path: '/projects',
		created: '',
		document_count: 1,
		sub_folders: [
			{ name: 'deep', path: '/projects/deep', created: '', document_count: 1, sub_folders: [] }
		]
	}
];

const pageTitles = () =>
	screen
		.getAllByTestId('folder-page-row')
		.map((r) => r.querySelector('[data-row-title]')!.textContent);
const folderNames = () =>
	screen
		.queryAllByTestId('folder-subfolder-row')
		.map((r) => r.querySelector('[data-row-title]')!.textContent);

describe('FolderView', () => {
	beforeEach(() => {
		resetAllState();
		vi.mocked(apiClient.getFolderTree).mockResolvedValue(tree);
		vi.mocked(apiClient.getDocuments).mockResolvedValue(docs);
		vi.mocked(apiClient.deleteDocumentByPath)
			.mockReset()
			.mockResolvedValue(undefined as never);
		vi.mocked(setPinned).mockClear();
		vi.mocked(goto).mockClear();
	});
	afterEach(() => cleanup());

	it('lists the root as "All pages": its folders first, then its pages by name', async () => {
		render(FolderView, { props: { path: '' } });

		await waitFor(() => expect(pageTitles()).toEqual(['Alpha', 'Beta', 'Gamma']));
		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('All pages');
		expect(screen.getByTestId('folder-counts')).toHaveTextContent('3 pages · 1 folder');
		expect(folderNames()).toEqual(['projects']);
		const folderRow = screen.getByTestId('folder-subfolder-row');
		expect(folderRow).toHaveTextContent('1 page');
		expect(within(folderRow).getByRole('link')).toHaveAttribute('href', '/folders/projects');
		expect(screen.getByTestId('documents-section')).toBeInTheDocument();
	});

	it('shows a page row with at most two tags, last changed and a link', async () => {
		render(FolderView, { props: { path: '' } });
		await waitFor(() => expect(pageTitles()).toHaveLength(3));

		const beta = screen.getAllByTestId('folder-page-row')[1];
		expect(within(beta).getByRole('link', { name: /Beta/ })).toHaveAttribute(
			'href',
			'/documents/beta'
		);
		expect(
			within(beta)
				.getAllByTestId('folder-row-tag')
				.map((t) => t.textContent?.trim())
		).toEqual(['one', 'two']);
		expect(beta).toHaveTextContent('+1');
		expect(beta.querySelector('time')).toHaveAttribute('datetime', '2024-03-01T00:00:00Z');
	});

	it('sorts by last changed and by created, either way', async () => {
		render(FolderView, { props: { path: '' } });
		await waitFor(() => expect(pageTitles()).toHaveLength(3));

		await chooseSelectOption(screen.getByLabelText('Sort by'), 'Last changed');
		expect(pageTitles()).toEqual(['Beta', 'Gamma', 'Alpha']);

		await userEvent.click(screen.getByRole('button', { name: 'Sort ascending' }));
		expect(pageTitles()).toEqual(['Alpha', 'Gamma', 'Beta']);

		// Dates sort newest first when chosen; the arrow flips it.
		await chooseSelectOption(screen.getByLabelText('Sort by'), 'Created');
		expect(pageTitles()).toEqual(['Alpha', 'Beta', 'Gamma']);
		await userEvent.click(screen.getByRole('button', { name: 'Sort ascending' }));
		expect(pageTitles()).toEqual(['Gamma', 'Beta', 'Alpha']);
	});

	it('shows a sub-folder with a humanised title, its subfolders and direct pages', async () => {
		render(FolderView, { props: { path: '/projects' } });

		await waitFor(() => expect(pageTitles()).toEqual(['Plan']));
		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Projects');
		expect(folderNames()).toEqual(['deep']);
		expect(screen.getByTestId('folder-counts')).toHaveTextContent('1 page · 1 folder');
	});

	it('lists every page below the folder with "Include subfolders", folders hidden', async () => {
		render(FolderView, { props: { path: '' } });
		await waitFor(() => expect(pageTitles()).toHaveLength(3));

		await userEvent.click(screen.getByRole('switch', { name: 'Include subfolders' }));

		expect(pageTitles()).toEqual(['Alpha', 'Beta', 'Gamma', 'Inner', 'Plan']);
		expect(folderNames()).toEqual([]);
		const rows = screen.getAllByTestId('folder-page-row');
		expect(rows[3]).toHaveTextContent('projects/deep');
		expect(rows[4]).toHaveTextContent('projects');
		expect(screen.getByTestId('folder-counts')).toHaveTextContent('5 pages');
	});

	it('pins and unpins from a row', async () => {
		render(FolderView, { props: { path: '' } });
		await waitFor(() => expect(pageTitles()).toHaveLength(3));

		await userEvent.click(screen.getByRole('button', { name: 'Unpin Alpha' }));
		expect(setPinned).toHaveBeenCalledWith('/alpha', false);
		await userEvent.click(screen.getByRole('button', { name: 'Pin Beta' }));
		expect(setPinned).toHaveBeenCalledWith('/beta', true);
	});

	it('edits, renames and deletes a page from its ⋯ menu', async () => {
		render(FolderView, { props: { path: '' } });
		await waitFor(() => expect(pageTitles()).toHaveLength(3));
		const menuOf = (title: string) =>
			screen.getByRole('button', { name: `More actions for ${title}` });

		await userEvent.click(menuOf('Gamma'));
		await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
		expect(goto).toHaveBeenCalledWith('/documents/gamma?mode=edit');

		await waitForPointerEvents();
		await userEvent.click(menuOf('Gamma'));
		await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
		expect(await screen.findByRole('dialog')).toHaveTextContent(/Rename/);
		await userEvent.keyboard('{Escape}');

		await waitForPointerEvents();
		await userEvent.click(menuOf('Gamma'));
		await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
		await waitForDialogFocus();
		await userEvent.click(screen.getByTestId('confirm-delete-button'));
		await waitFor(() => expect(apiClient.deleteDocumentByPath).toHaveBeenCalledWith('/gamma'));
	});

	it('selects pages and deletes them together after confirming', async () => {
		render(FolderView, { props: { path: '' } });
		await waitFor(() => expect(pageTitles()).toHaveLength(3));
		expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

		await userEvent.click(screen.getByRole('button', { name: 'Select' }));
		await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
		await userEvent.click(screen.getByRole('checkbox', { name: 'Select Gamma' }));
		const bar = screen.getByTestId('folder-selection-bar');
		expect(bar).toHaveTextContent('2 selected');

		await userEvent.click(within(bar).getByRole('button', { name: 'Delete (2)' }));
		await waitForDialogFocus();
		await userEvent.click(screen.getByTestId('confirm-delete-button'));

		await waitFor(() => expect(apiClient.deleteDocumentByPath).toHaveBeenCalledTimes(2));
		expect(apiClient.deleteDocumentByPath).toHaveBeenCalledWith('/alpha');
		expect(apiClient.deleteDocumentByPath).toHaveBeenCalledWith('/gamma');
	});

	it('selects all and leaves select mode with Done', async () => {
		render(FolderView, { props: { path: '' } });
		await waitFor(() => expect(pageTitles()).toHaveLength(3));

		await userEvent.click(screen.getByRole('button', { name: 'Select' }));
		const bar = screen.getByTestId('folder-selection-bar');
		await userEvent.click(within(bar).getByRole('button', { name: 'Select all' }));
		expect(bar).toHaveTextContent('3 selected');

		await userEvent.click(within(bar).getByRole('button', { name: 'Done' }));
		expect(screen.queryByTestId('folder-selection-bar')).not.toBeInTheDocument();
		expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
	});

	it('starts a new page in this folder, and creates a folder from the header', async () => {
		vi.mocked(apiClient.createFolder).mockResolvedValue(undefined as never);
		render(FolderView, { props: { path: '/projects' } });
		await waitFor(() => expect(pageTitles()).toEqual(['Plan']));

		await userEvent.click(screen.getByTestId('create-document'));
		expect(goto).toHaveBeenCalledWith('/new/projects');

		await userEvent.click(screen.getByTestId('create-folder-header'));
		await waitForDialogFocus();
		expect(screen.getByRole('dialog')).toBeInTheDocument();
	});

	it('shows an empty state with create buttons in an empty folder', async () => {
		vi.mocked(apiClient.getFolderTree).mockResolvedValue([]);
		render(FolderView, { props: { path: '/empty' } });

		const empty = await screen.findByTestId('empty-folder-message');
		expect(empty).toHaveTextContent('This folder is empty');
		expect(screen.getByTestId('create-folder-empty')).toBeInTheDocument();
	});

	it('hides the create buttons when asked to', async () => {
		vi.mocked(apiClient.getDocuments).mockResolvedValue([]);
		vi.mocked(apiClient.getFolderTree).mockResolvedValue([]);
		render(FolderView, { props: { path: '/empty', showCreateButtons: false } });

		await screen.findByTestId('empty-folder-message');
		expect(screen.queryByTestId('create-document')).not.toBeInTheDocument();
		expect(screen.queryByTestId('create-folder-empty')).not.toBeInTheDocument();
	});
});

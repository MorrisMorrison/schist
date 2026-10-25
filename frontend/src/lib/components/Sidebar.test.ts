import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import type { Document, Folder } from '$lib/api/types';

const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/') }));
vi.mock('$app/state', () => ({ page: pageState }));

vi.mock('$lib/components/folder/FolderTree.svelte', async () => ({
	default: (await import('$lib/test/stub-component')).namedStub('FolderTree')
}));
vi.mock('$lib/components/modal/CreateFolderModal.svelte', async () => ({
	default: (await import('$lib/test/stub-component')).namedStub('CreateFolderModal')
}));
vi.mock('$lib/components/modal/RenameFolderModal.svelte', async () => ({
	default: (await import('$lib/test/stub-component')).namedStub('RenameFolderModal')
}));
vi.mock('$lib/components/modal/RenameDocumentModal.svelte', async () => ({
	default: (await import('$lib/test/stub-component')).namedStub('RenameDocumentModal')
}));
vi.mock('$lib/components/modal/ImportDocumentsModal.svelte', async () => ({
	default: (await import('$lib/test/stub-component')).namedStub('ImportDocumentsModal')
}));

vi.mock('$lib/api/client', () => ({
	apiClient: { exportFolder: vi.fn(), exportDocument: vi.fn(), exportAll: vi.fn() }
}));

vi.mock('$lib/stores/documents.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/stores/documents.svelte')>()),
	folderActions: { loadFolderTree: vi.fn(), deleteFolder: vi.fn() },
	documentActions: { deleteDocumentByPath: vi.fn(), loadDocuments: vi.fn() },
	foldersStore: { folders: [] }
}));

import { goto } from '$app/navigation';
import { apiClient } from '$lib/api/client';
import { documentActions, folderActions } from '$lib/stores/documents.svelte';
import { stubProps } from '$lib/test/stub-registry';
import Sidebar from './Sidebar.svelte';

const folder = {
	name: 'Projects',
	path: '/projects',
	children: [],
	documents: []
} as unknown as Folder;
const page = {
	metaData: { title: 'Launch Plan', path: '/projects/launch-plan', slug: 'launch-plan' },
	content: ''
} as Document;

const tree = () => stubProps.FolderTree;
function call(stub: string, prop: string, ...args: unknown[]) {
	const result = stubProps[stub][prop](...args);
	flushSync();
	return result;
}

describe('Sidebar', () => {
	beforeEach(() => {
		pageState.url = new URL('http://localhost/');
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.restoreAllMocks();
		for (const key of Object.keys(stubProps)) delete stubProps[key];
	});

	it('passes the current path and options to the folder tree', () => {
		pageState.url = new URL('http://localhost/folders/projects');
		render(Sidebar);

		expect(tree().currentPath).toBe('/folders/projects');
		expect(tree().showPages).toBe(true);
		expect(tree().storageKey).toBe('sidebar-expanded-folders');
	});

	it('navigates to selected folders and documents', () => {
		render(Sidebar);

		call('FolderTree', 'onselect', { path: '/projects', folder });
		expect(goto).toHaveBeenCalledWith('/folders/projects');

		call('FolderTree', 'ondocumentselect', { document: page });
		expect(goto).toHaveBeenCalledWith('/documents/projects/launch-plan');

		call('FolderTree', 'ondocumentselect', { document: { metaData: { slug: 'loose' } } });
		expect(goto).toHaveBeenCalledWith('/documents/loose');
	});

	it('creates documents under the chosen folder', () => {
		render(Sidebar);

		call('FolderTree', 'ondocumentcreate', { parentPath: '/' });
		expect(goto).toHaveBeenCalledWith('/new');

		call('FolderTree', 'ondocumentcreate', { parentPath: '/projects' });
		expect(goto).toHaveBeenCalledWith('/new/projects');
	});

	it('opens the create-folder modal and reloads the tree once created', () => {
		render(Sidebar);
		expect(stubProps.CreateFolderModal.open).toBe(false);

		call('FolderTree', 'oncreate', { parentPath: '/projects' });
		expect(stubProps.CreateFolderModal.open).toBe(true);
		expect(stubProps.CreateFolderModal.parentPath).toBe('/projects');

		call('CreateFolderModal', 'onCreated');
		expect(stubProps.CreateFolderModal.open).toBe(false);
		expect(folderActions.loadFolderTree).toHaveBeenCalled();
	});

	it('closes the create-folder modal without reloading', () => {
		render(Sidebar);
		call('FolderTree', 'oncreate', { parentPath: '/' });

		call('CreateFolderModal', 'onClose');

		expect(stubProps.CreateFolderModal.open).toBe(false);
		expect(folderActions.loadFolderTree).not.toHaveBeenCalled();
	});

	it('opens the create-folder modal from the global event', () => {
		pageState.url = new URL('http://localhost/folders/projects');
		render(Sidebar);

		window.dispatchEvent(new CustomEvent('openCreateFolderModal'));
		flushSync();

		expect(stubProps.CreateFolderModal.open).toBe(true);
		expect(stubProps.CreateFolderModal.parentPath).toBe('/projects');
	});

	it('uses the root for the global event outside folder pages', () => {
		pageState.url = new URL('http://localhost/recent');
		render(Sidebar);

		window.dispatchEvent(new CustomEvent('openCreateFolderModal'));
		flushSync();

		expect(stubProps.CreateFolderModal.parentPath).toBe('/');
	});

	it('renames a folder and reloads the tree', () => {
		render(Sidebar);

		call('FolderTree', 'onrename', { path: '/projects', folder });
		expect(stubProps.RenameFolderModal.open).toBe(true);
		expect(stubProps.RenameFolderModal.folder).toEqual(folder);

		call('RenameFolderModal', 'onRenamed');
		expect(stubProps.RenameFolderModal.open).toBe(false);
		expect(folderActions.loadFolderTree).toHaveBeenCalled();

		call('FolderTree', 'onrename', { path: '/projects', folder });
		call('RenameFolderModal', 'onClose');
		expect(stubProps.RenameFolderModal.open).toBe(false);
	});

	it('deletes a folder after confirmation', async () => {
		vi.mocked(folderActions.deleteFolder).mockResolvedValue(undefined as never);
		render(Sidebar);

		await call('FolderTree', 'ondelete', { path: '/projects', folder });
		expect(await screen.findByText(/delete "Projects"/)).toBeInTheDocument();

		await fireEvent.click(screen.getByTestId('confirm-delete-button'));

		expect(folderActions.deleteFolder).toHaveBeenCalledWith('/projects');
		await vi.waitFor(() => expect(screen.queryByText(/delete "Projects"/)).not.toBeInTheDocument());
	});

	it('keeps the folder dialog open when deleting fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(folderActions.deleteFolder).mockRejectedValue(new Error('nope'));
		render(Sidebar);
		await call('FolderTree', 'ondelete', { path: '/projects', folder });

		await fireEvent.click(await screen.findByTestId('confirm-delete-button'));

		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
		expect(screen.getByText(/delete "Projects"/)).toBeInTheDocument();
	});

	it('cancels deleting a folder', async () => {
		render(Sidebar);
		await call('FolderTree', 'ondelete', { path: '/projects', folder });

		await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

		await vi.waitFor(() => expect(screen.queryByText(/delete "Projects"/)).not.toBeInTheDocument());
		expect(folderActions.deleteFolder).not.toHaveBeenCalled();
	});

	it('deletes a page after confirmation', async () => {
		vi.mocked(documentActions.deleteDocumentByPath).mockResolvedValue(undefined as never);
		render(Sidebar);

		call('FolderTree', 'ondocumentdelete', { document: page });
		expect(await screen.findByText(/delete "Launch Plan"/)).toBeInTheDocument();

		await fireEvent.click(screen.getByTestId('confirm-delete-button'));

		expect(documentActions.deleteDocumentByPath).toHaveBeenCalledWith('/projects/launch-plan');
		await vi.waitFor(() =>
			expect(screen.queryByText(/delete "Launch Plan"/)).not.toBeInTheDocument()
		);
	});

	it('keeps the page dialog open when deleting fails, and cancels it', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(documentActions.deleteDocumentByPath).mockRejectedValue(new Error('nope'));
		render(Sidebar);
		call('FolderTree', 'ondocumentdelete', { document: page });

		await fireEvent.click(await screen.findByTestId('confirm-delete-button'));
		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
		expect(screen.getByText(/delete "Launch Plan"/)).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await vi.waitFor(() =>
			expect(screen.queryByText(/delete "Launch Plan"/)).not.toBeInTheDocument()
		);
	});

	it('renames the open page and follows it to its new path', async () => {
		pageState.url = new URL('http://localhost/documents/projects/launch-plan');
		vi.mocked(documentActions.loadDocuments).mockResolvedValue(undefined as never);
		render(Sidebar);

		call('FolderTree', 'ondocumentrename', { document: page });
		expect(stubProps.RenameDocumentModal.open).toBe(true);
		expect(stubProps.RenameDocumentModal.document).toEqual(page);

		await call('RenameDocumentModal', 'onRenamed', '/projects/launch-plan', '/projects/kickoff');

		expect(documentActions.loadDocuments).toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith('/documents/projects/kickoff');
		expect(screen.queryByTestId('stub-RenameDocumentModal')).not.toBeInTheDocument();
	});

	it('does not navigate when renaming a page that is not open', async () => {
		pageState.url = new URL('http://localhost/');
		render(Sidebar);
		call('FolderTree', 'ondocumentrename', { document: page });

		await call('RenameDocumentModal', 'onRenamed', '/projects/launch-plan', '/projects/kickoff');

		expect(goto).not.toHaveBeenCalled();
	});

	it('closes the rename-page modal', () => {
		render(Sidebar);
		call('FolderTree', 'ondocumentrename', { document: page });

		call('RenameDocumentModal', 'onClose');

		expect(screen.queryByTestId('stub-RenameDocumentModal')).not.toBeInTheDocument();
	});

	it('exports folders, documents and everything', () => {
		render(Sidebar);

		call('FolderTree', 'onfolderexport', { path: '/projects', folder });
		call('FolderTree', 'ondocumentexport', { path: '/projects/launch-plan', document: page });
		call('FolderTree', 'onexportall');

		expect(apiClient.exportFolder).toHaveBeenCalledWith('/projects');
		expect(apiClient.exportDocument).toHaveBeenCalledWith('/projects/launch-plan');
		expect(apiClient.exportAll).toHaveBeenCalled();
	});

	it('opens and closes the import modal', async () => {
		render(Sidebar);
		expect(stubProps.ImportDocumentsModal.open).toBe(false);

		await fireEvent.click(screen.getByRole('button', { name: 'Import Documents' }));
		expect(stubProps.ImportDocumentsModal.open).toBe(true);

		call('ImportDocumentsModal', 'onSuccess');
		expect(stubProps.ImportDocumentsModal.open).toBe(false);

		await fireEvent.click(screen.getByRole('button', { name: 'Import Documents' }));
		call('ImportDocumentsModal', 'onClose');
		expect(stubProps.ImportDocumentsModal.open).toBe(false);
	});

	it('stops listening for the global event when unmounted', () => {
		const { unmount } = render(Sidebar);
		const createModal = stubProps.CreateFolderModal;
		unmount();

		window.dispatchEvent(new CustomEvent('openCreateFolderModal'));
		flushSync();

		expect(createModal.open).not.toBe(true);
	});
});

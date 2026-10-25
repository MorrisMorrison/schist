import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { apiClient } from '$lib/api/client';
import { authService } from '$lib/auth/auth-service';
import {
	resetAllState,
	setFoldersState,
	setDocumentsState,
	currentFolder
} from '$lib/stores/documents.svelte';
import type { Document, Folder } from '$lib/api/types';
import { waitForPointerEvents } from '$lib/test/dialog';
import FolderTree from './FolderTree.svelte';

/** The open tree context menu, once it has taken focus (and so listens for outside presses). */
async function openedMenu(name: string) {
	const menu = await screen.findByRole('menu', { name });
	await waitFor(() => expect(menu).toHaveFocus());
	return menu;
}

async function menuClosed() {
	await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
	await waitForPointerEvents();
}

vi.mock('$lib/api/client', () => ({
	apiClient: {
		getFolderTree: vi.fn(),
		getDocuments: vi.fn(),
		moveFolder: vi.fn(),
		moveDocument: vi.fn()
	}
}));

vi.mock('$lib/auth/auth-service', () => ({
	authService: {
		initialize: vi.fn(),
		isAuthEnabled: vi.fn(() => false),
		checkAuthStatus: vi.fn()
	}
}));

function folder(path: string, sub: Folder[] = [], count = 0): Folder {
	return {
		name: path.split('/').pop()!,
		path,
		created: '2024-01-01T00:00:00Z',
		document_count: count,
		sub_folders: sub
	};
}

function doc(path: string, title: string, tags: string[] = []): Document {
	return { metaData: { title, path, slug: path.split('/').pop(), tags }, content: '' };
}

const tree: Folder[] = [folder('/notes', [folder('/notes/daily')], 2), folder('/work', [], 0)];

const docs: Document[] = [
	doc('/readme', 'Readme'),
	doc('/notes/alpha', 'Alpha', ['project']),
	doc('/notes/beta', 'Beta', ['personal']),
	doc('/notes/daily/today', 'Today')
];

const STORAGE_KEY = 'test-folder-tree';

describe('FolderTree', () => {
	function renderTree(props: Record<string, unknown> = {}) {
		return render(FolderTree, { props: { storageKey: STORAGE_KEY, ...props } });
	}

	function folderItem(name: string) {
		return screen
			.getByRole('button', { name: `Open folder ${name}` })
			.closest('[role="treeitem"]')!;
	}

	function treeItemNames() {
		return screen
			.getAllByTestId('folder-name-button')
			.map((b) => b.textContent!.replace(/\s+/g, ' ').trim());
	}

	beforeEach(() => {
		localStorage.removeItem(STORAGE_KEY);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(authService.isAuthEnabled).mockReturnValue(false);
		vi.mocked(apiClient.getFolderTree).mockResolvedValue(tree);
		vi.mocked(apiClient.getDocuments).mockResolvedValue(docs);
		setFoldersState({ folders: tree });
		setDocumentsState({ documents: docs });
	});

	afterEach(() => {
		cleanup();
		resetAllState();
		localStorage.removeItem(STORAGE_KEY);
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('loads the folder tree on mount and renders top-level folders', async () => {
		renderTree();
		await waitFor(() => expect(apiClient.getFolderTree).toHaveBeenCalledTimes(1));
		expect(apiClient.getDocuments).not.toHaveBeenCalled();
		expect(screen.getByRole('tree', { name: 'Folder tree' })).toBeInTheDocument();
		expect(treeItemNames()).toEqual(['notes 2', 'work']);
	});

	it('also loads documents when pages are shown', async () => {
		renderTree({ showPages: true });
		await waitFor(() => expect(apiClient.getDocuments).toHaveBeenCalled());
	});

	it('skips loading when auth is enabled and the user is signed out', async () => {
		vi.mocked(authService.isAuthEnabled).mockReturnValue(true);
		vi.mocked(authService.checkAuthStatus).mockResolvedValue(false);
		renderTree();
		await waitFor(() => expect(authService.checkAuthStatus).toHaveBeenCalled());
		expect(apiClient.getFolderTree).not.toHaveBeenCalled();
	});

	it('loads when auth is enabled and the user is signed in', async () => {
		vi.mocked(authService.isAuthEnabled).mockReturnValue(true);
		vi.mocked(authService.checkAuthStatus).mockResolvedValue(true);
		renderTree();
		await waitFor(() => expect(apiClient.getFolderTree).toHaveBeenCalled());
	});

	it('hides page counts when showPageCounts is false', () => {
		renderTree({ showPageCounts: false });
		expect(treeItemNames()).toEqual(['notes', 'work']);
	});

	it('keeps an (empty) tree in the sidebar when there are no folders yet', async () => {
		vi.mocked(apiClient.getFolderTree).mockResolvedValue([]);
		vi.mocked(apiClient.getDocuments).mockResolvedValue([]);
		setFoldersState({ folders: [] });
		setDocumentsState({ documents: [] });
		renderTree({ showPages: true });
		// The sidebar has no root row; the "+" menu creates the first folder.
		expect(screen.getByRole('tree', { name: 'Folder tree' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Open folder /' })).not.toBeInTheDocument();
		expect(screen.queryByText('No folders yet')).not.toBeInTheDocument();
	});

	it('shows the empty state with a create button', async () => {
		vi.mocked(apiClient.getFolderTree).mockResolvedValue([]);
		setFoldersState({ folders: [] });
		const oncreate = vi.fn();
		renderTree({ oncreate });
		expect(screen.getByText('No folders yet')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: /create folder/i }));
		expect(oncreate).toHaveBeenCalledWith({ parentPath: '/' });
	});

	it('shows the store error and clears it on dismiss', async () => {
		renderTree();
		setFoldersState({ error: 'Failed to load folder tree' });
		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Failed to load folder tree');
		await userEvent.click(within(alert).getByRole('button'));
		await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
	});

	it('shows a spinner while the tree is loading for a while', async () => {
		renderTree();
		await waitFor(() => expect(apiClient.getFolderTree).toHaveBeenCalled());
		setFoldersState({ loading: true });
		await waitFor(() => expect(screen.queryByRole('tree')).not.toBeInTheDocument(), {
			timeout: 2000
		});
		setFoldersState({ loading: false });
		expect(await screen.findByRole('tree', {}, { timeout: 2000 })).toBeInTheDocument();
	});

	it('expands and collapses folders via the chevron and remembers it', async () => {
		renderTree();
		const notes = folderItem('notes');
		expect(notes).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByRole('button', { name: 'Open folder daily' })).not.toBeInTheDocument();

		await userEvent.click(
			within(notes as HTMLElement).getByRole('button', { name: 'Expand folder' })
		);
		expect(folderItem('notes')).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByRole('button', { name: 'Open folder daily' })).toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toContain('/notes');

		await userEvent.click(
			within(folderItem('notes') as HTMLElement).getByRole('button', { name: 'Collapse folder' })
		);
		expect(screen.queryByRole('button', { name: 'Open folder daily' })).not.toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).not.toContain('/notes');
	});

	it('restores expanded folders from localStorage and ignores bad JSON', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(['/notes']));
		const { unmount } = renderTree();
		expect(screen.getByRole('button', { name: 'Open folder daily' })).toBeInTheDocument();
		unmount();

		localStorage.setItem(STORAGE_KEY, '{not json');
		renderTree();
		expect(console.warn).toHaveBeenCalled();
		expect(screen.queryByRole('button', { name: 'Open folder daily' })).not.toBeInTheDocument();
	});

	it('handles keyboard navigation on a folder', async () => {
		const onselect = vi.fn();
		renderTree({ onselect });
		const nameButton = screen.getByRole('button', { name: 'Open folder notes' });

		await fireEvent.keyDown(nameButton, { key: 'ArrowRight' });
		expect(folderItem('notes')).toHaveAttribute('aria-expanded', 'true');
		await fireEvent.keyDown(nameButton, { key: 'ArrowLeft' });
		expect(folderItem('notes')).toHaveAttribute('aria-expanded', 'false');
		await fireEvent.keyDown(nameButton, { key: 'Enter' });
		await fireEvent.keyDown(nameButton, { key: ' ' });
		expect(onselect).toHaveBeenCalledTimes(2);
		expect(onselect).toHaveBeenCalledWith({ path: '/notes', folder: tree[0] });
	});

	it('expands all and collapses all from the header actions', async () => {
		const onexpandall = vi.fn();
		const oncollapseall = vi.fn();
		const ondocumentcreate = vi.fn();
		renderTree({ showActions: true, onexpandall, oncollapseall, ondocumentcreate });

		await userEvent.click(screen.getByTitle('Expand all folders'));
		expect(onexpandall).toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Open folder daily' })).toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(
			expect.arrayContaining(['/notes', '/notes/daily', '/work'])
		);

		await userEvent.click(screen.getByTitle('Collapse all folders'));
		expect(oncollapseall).toHaveBeenCalled();
		expect(screen.queryByRole('button', { name: 'Open folder daily' })).not.toBeInTheDocument();

		await userEvent.click(screen.getByTestId('sidebar-new-menu'));
		await userEvent.click(await screen.findByRole('menuitem', { name: 'New page' }));
		expect(ondocumentcreate).toHaveBeenCalledWith({ parentPath: '/' });
	});

	it('offers new page, new folder, import and export all in the + menu', async () => {
		const handlers = {
			ondocumentcreate: vi.fn(),
			oncreate: vi.fn(),
			onimport: vi.fn(),
			onexportall: vi.fn()
		};
		renderTree({ showActions: true, showPages: true, ...handlers });

		const pick = async (name: string) => {
			// bits-ui disables pointer events on <body> until a closing menu is gone.
			await waitForPointerEvents();
			await userEvent.click(screen.getByTestId('sidebar-new-menu'));
			await userEvent.click(await screen.findByRole('menuitem', { name }));
		};
		await pick('New folder');
		expect(handlers.oncreate).toHaveBeenCalledWith({ parentPath: '/' });
		await pick('Import documents');
		expect(handlers.onimport).toHaveBeenCalledTimes(1);
		await pick('Export all');
		expect(handlers.onexportall).toHaveBeenCalledTimes(1);
	});

	it('leaves out import and export all when they are not wired', async () => {
		renderTree({ showActions: true });
		await userEvent.click(screen.getByTestId('sidebar-new-menu'));
		expect(await screen.findByRole('menuitem', { name: 'New page' })).toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: 'Import documents' })).not.toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: 'Export all' })).not.toBeInTheDocument();
	});

	it('keeps top-level pages visible when collapsing all', async () => {
		renderTree({ showActions: true, showPages: true });
		await userEvent.click(screen.getByTitle('Collapse all folders'));
		// Top-level pages have no folder to collapse into.
		expect(screen.getByText('Readme')).toBeInTheDocument();
		expect(screen.queryByText('Today')).not.toBeInTheDocument();
		await userEvent.click(screen.getByTitle('Expand all folders'));
		expect(screen.getByText('Today')).toBeInTheDocument();
	});

	it('lists top-level pages without a root row and selects documents', async () => {
		const ondocumentselect = vi.fn();
		renderTree({ showPages: true, ondocumentselect, currentPath: '/documents/readme' });
		expect(screen.queryByRole('button', { name: 'Open folder /' })).not.toBeInTheDocument();
		expect(screen.getByText('Readme')).toBeInTheDocument();

		await userEvent.click(
			screen.getByRole('button', { name: 'Open folder notes' }).previousElementSibling!
		);
		expect(screen.getByText('Alpha')).toBeInTheDocument();

		const readme = screen
			.getAllByTestId('document-name-button')
			.find((b) => b.textContent?.includes('Readme'))!;
		await userEvent.click(readme);
		expect(ondocumentselect).toHaveBeenCalledWith({ document: docs[0] });
	});

	it('marks the current folder from currentPath', () => {
		renderTree({ currentPath: '/folders/work', selectedPath: '/notes' });
		expect(folderItem('work').className).toContain('font-medium');
		expect(folderItem('notes')).toHaveAttribute('aria-selected', 'true');
	});

	it('auto-expands the current folder from the store', async () => {
		renderTree();
		currentFolder.set('/notes');
		expect(await screen.findByRole('button', { name: 'Open folder daily' })).toBeInTheDocument();
	});

	it('finds a top-level page when no folder matches the search', async () => {
		renderTree({ showSearch: true, showPages: true });
		const search = screen.getByPlaceholderText('Filter pages… (tag:name)');

		await userEvent.type(search, 'readme');
		expect(screen.getByText('Readme')).toBeInTheDocument();
		expect(screen.queryByText('No folders match your search.')).not.toBeInTheDocument();
	});

	it('shows the no-match message when nothing matches and there are no folders', async () => {
		vi.mocked(apiClient.getFolderTree).mockResolvedValue([]);
		setFoldersState({ folders: [] });
		renderTree({ showSearch: true, showPages: true });
		const search = screen.getByPlaceholderText('Filter pages… (tag:name)');

		await userEvent.type(search, 'zzz-nothing');
		expect(screen.getByText('No folders match your search.')).toBeInTheDocument();
		expect(screen.queryByRole('treeitem')).not.toBeInTheDocument();
	});

	it('filters folders and pages by text and tag', async () => {
		renderTree({ showSearch: true, showPages: true });
		const search = screen.getByPlaceholderText('Filter pages… (tag:name)');

		await userEvent.type(search, 'daily');
		expect(screen.getByRole('button', { name: 'Open folder notes' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Open folder work' })).not.toBeInTheDocument();
		await userEvent.click(
			screen.getByRole('button', { name: 'Open folder notes' }).previousElementSibling!
		);
		expect(screen.getByRole('button', { name: 'Open folder daily' })).toBeInTheDocument();
		// Pages that don't match are filtered out of matching folders.
		expect(screen.queryByText('Alpha')).not.toBeInTheDocument();

		await userEvent.clear(search);
		await userEvent.type(search, 'tag:proj');
		// /notes is still expanded from above.
		expect(screen.getByText('Alpha')).toBeInTheDocument();
		expect(screen.queryByText('Beta')).not.toBeInTheDocument();

		await userEvent.clear(search);
		await userEvent.type(search, 'zzz-nothing');
		expect(screen.getByText('No folders match your search.')).toBeInTheDocument();
	});

	it('opens the folder context menu and routes its actions', async () => {
		const handlers = {
			oncreate: vi.fn(),
			ondocumentcreate: vi.fn(),
			onrename: vi.fn(),
			ondelete: vi.fn(),
			onfolderexport: vi.fn()
		};
		renderTree(handlers);

		const openMenu = async () => {
			await userEvent.click(
				within(folderItem('notes') as HTMLElement).getByTestId('folder-context-menu-trigger')
			);
			return openedMenu('Folder actions');
		};

		await userEvent.click(within(await openMenu()).getByText('Create Subfolder'));
		expect(handlers.oncreate).toHaveBeenCalledWith({ parentPath: '/notes' });
		await menuClosed();

		await userEvent.click(within(await openMenu()).getByText('Create Document'));
		expect(handlers.ondocumentcreate).toHaveBeenCalledWith({ parentPath: '/notes' });

		await userEvent.click(within(await openMenu()).getByText('Rename'));
		expect(handlers.onrename).toHaveBeenCalledWith({ path: '/notes', folder: tree[0] });

		await userEvent.click(within(await openMenu()).getByText('Delete'));
		expect(handlers.ondelete).toHaveBeenCalledWith({ path: '/notes', folder: tree[0] });

		await userEvent.click(within(await openMenu()).getByText('Export'));
		expect(handlers.onfolderexport).toHaveBeenCalledWith({ path: '/notes', folder: tree[0] });

		await openMenu();
		await userEvent.keyboard('{Escape}');
		await menuClosed();
	});

	it('opens the context menu by right-click and keyboard, and closes it on outside click', async () => {
		renderTree();
		// Right-clicked near the viewport's bottom-right corner.
		await fireEvent.contextMenu(folderItem('work'), {
			clientX: window.innerWidth - 2,
			clientY: window.innerHeight - 2
		});
		const menu = await openedMenu('Folder actions');
		// Kept inside the viewport.
		await waitFor(() => {
			const rect = menu.getBoundingClientRect();
			expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
			expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
		});

		await userEvent.click(document.body);
		await menuClosed();

		const trigger = within(folderItem('work') as HTMLElement).getByTestId(
			'folder-context-menu-trigger'
		);
		await fireEvent.keyDown(trigger, { key: 'Enter' });
		expect(await screen.findByRole('menu', { name: 'Folder actions' })).toBeInTheDocument();
	});

	it('opens at the pointer and moves to another row on a second right-click', async () => {
		renderTree({ showPages: true });
		await fireEvent.contextMenu(folderItem('work'), { clientX: 40, clientY: 60 });
		const folderMenu = await openedMenu('Folder actions');
		await waitFor(() => expect(Math.round(folderMenu.getBoundingClientRect().top)).toBe(60));

		const readme = screen
			.getAllByTestId('document-item')
			.find((el) => el.textContent?.includes('Readme'))!;
		await fireEvent.contextMenu(readme, { clientX: 50, clientY: 80 });

		expect(await screen.findByRole('menu', { name: 'Document actions' })).toBeInTheDocument();
		expect(screen.queryByRole('menu', { name: 'Folder actions' })).not.toBeInTheDocument();
	});

	it('suppresses context menus on empty tree space and when disabled', async () => {
		const { unmount } = renderTree();
		await fireEvent.contextMenu(folderItem('work'));
		expect(await screen.findByRole('menu')).toBeInTheDocument();
		await fireEvent.contextMenu(screen.getByRole('tree'));
		await menuClosed();
		unmount();

		renderTree({ enableContextMenu: false });
		expect(screen.queryByTestId('folder-context-menu-trigger')).not.toBeInTheDocument();
		await fireEvent.contextMenu(folderItem('work'));
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});

	it('moves an item to the top level when dropped on blank tree space', async () => {
		vi.mocked(apiClient.moveFolder).mockResolvedValue(undefined as never);
		renderTree({ showPages: true });
		await userEvent.click(
			screen.getByRole('button', { name: 'Open folder notes' }).previousElementSibling!
		);
		const dataTransfer = new DataTransfer();
		const source = folderItem('daily');
		const tree = screen.getByRole('tree', { name: 'Folder tree' });

		await fireEvent.dragStart(source, { dataTransfer });
		await fireEvent.dragOver(tree, { dataTransfer });
		await fireEvent.drop(tree, { dataTransfer });

		await waitFor(() =>
			expect(apiClient.moveFolder).toHaveBeenCalledWith({
				oldPath: '/notes/daily',
				newPath: '/daily'
			})
		);
		await fireEvent.dragEnd(source);
	});

	it('does not also move to the top level when dropped on a folder row', async () => {
		vi.mocked(apiClient.moveFolder).mockResolvedValue(undefined as never);
		renderTree({ showPages: true });
		const dataTransfer = new DataTransfer();
		const source = folderItem('work');
		const target = folderItem('notes');

		await fireEvent.dragStart(source, { dataTransfer });
		await fireEvent.dragEnter(target, { dataTransfer });
		await fireEvent.dragOver(target, { dataTransfer });
		await fireEvent.drop(target, { dataTransfer });

		await waitFor(() => expect(apiClient.moveFolder).toHaveBeenCalledTimes(1));
		expect(apiClient.moveFolder).toHaveBeenCalledWith({ oldPath: '/work', newPath: '/notes/work' });
		await fireEvent.dragEnd(source);
	});

	it('opens the document context menu and routes its actions', async () => {
		const handlers = {
			ondocumentrename: vi.fn(),
			ondocumentdelete: vi.fn(),
			ondocumentexport: vi.fn()
		};
		renderTree({ showPages: true, ...handlers });
		const readmeItem = () =>
			screen.getAllByTestId('document-item').find((el) => el.textContent?.includes('Readme'))!;

		const openMenu = async () => {
			await fireEvent.contextMenu(readmeItem());
			return openedMenu('Document actions');
		};

		await userEvent.click(within(await openMenu()).getByText('Rename'));
		expect(handlers.ondocumentrename).toHaveBeenCalledWith({ document: docs[0] });

		await userEvent.click(within(await openMenu()).getByText('Delete'));
		expect(handlers.ondocumentdelete).toHaveBeenCalledWith({ document: docs[0] });

		await userEvent.click(within(await openMenu()).getByText('Export'));
		expect(handlers.ondocumentexport).toHaveBeenCalledWith({
			path: '/readme',
			document: docs[0]
		});
	});

	it('moves a folder when it is dropped onto another folder', async () => {
		vi.mocked(apiClient.moveFolder).mockResolvedValue(undefined as never);
		renderTree();
		const dataTransfer = new DataTransfer();
		const source = folderItem('work');
		const target = folderItem('notes');

		await fireEvent.dragStart(source, { dataTransfer });
		await fireEvent.dragEnter(target, { dataTransfer });
		await fireEvent.dragOver(target, { dataTransfer });
		expect(target.className).toContain('ring-2');
		await fireEvent.dragLeave(target, { dataTransfer });
		await fireEvent.drop(target, { dataTransfer });

		await waitFor(() =>
			expect(apiClient.moveFolder).toHaveBeenCalledWith({
				oldPath: '/work',
				newPath: '/notes/work'
			})
		);
		await fireEvent.dragEnd(source);
	});

	it('exposes expandFolder()', async () => {
		const { component } = renderTree();
		(component as unknown as { expandFolder: (p: string) => void }).expandFolder('/notes');
		expect(await screen.findByRole('button', { name: 'Open folder daily' })).toBeInTheDocument();
	});
});

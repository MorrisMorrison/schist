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
import FolderTree from './FolderTree.svelte';

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
		return screen.getAllByTestId('folder-name-button').map((b) => b.textContent!.trim());
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
		expect(treeItemNames()).toEqual(['notes (2)', 'work']);
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

		await userEvent.click(screen.getByTitle('Create new document'));
		expect(ondocumentcreate).toHaveBeenCalledWith({ parentPath: '/' });
	});

	it('expand all includes the root node when pages are shown', async () => {
		renderTree({ showActions: true, showPages: true });
		await userEvent.click(screen.getByTitle('Collapse all folders'));
		expect(screen.queryByText('Readme')).not.toBeInTheDocument();
		await userEvent.click(screen.getByTitle('Expand all folders'));
		expect(screen.getByText('Readme')).toBeInTheDocument();
		expect(screen.getByText('Today')).toBeInTheDocument();
	});

	it('renders a root node with pages and selects documents', async () => {
		const ondocumentselect = vi.fn();
		renderTree({ showPages: true, ondocumentselect, currentPath: '/documents/readme' });
		const root = folderItem('/');
		expect(root).toHaveAttribute('aria-expanded', 'true');
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

	it('filters folders and pages by text and tag', async () => {
		renderTree({ showSearch: true, showPages: true });
		const search = screen.getByPlaceholderText("Filter folders, pages... (try 'tag:name')");

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
			return screen.getByRole('menu', { name: 'Folder actions' });
		};

		await userEvent.click(within(await openMenu()).getByText('Create Subfolder'));
		expect(handlers.oncreate).toHaveBeenCalledWith({ parentPath: '/notes' });
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();

		await userEvent.click(within(await openMenu()).getByText('Create Document'));
		expect(handlers.ondocumentcreate).toHaveBeenCalledWith({ parentPath: '/notes' });

		await userEvent.click(within(await openMenu()).getByText('Rename'));
		expect(handlers.onrename).toHaveBeenCalledWith({ path: '/notes', folder: tree[0] });

		await userEvent.click(within(await openMenu()).getByText('Delete'));
		expect(handlers.ondelete).toHaveBeenCalledWith({ path: '/notes', folder: tree[0] });

		await userEvent.click(within(await openMenu()).getByText('Export'));
		expect(handlers.onfolderexport).toHaveBeenCalledWith({ path: '/notes', folder: tree[0] });

		const menu = await openMenu();
		await fireEvent.keyDown(menu, { key: 'Escape' });
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});

	it('opens the context menu by right-click and keyboard, and closes it on outside click', async () => {
		renderTree();
		await fireEvent.contextMenu(folderItem('work'), { clientX: 5000, clientY: 5000 });
		const menu = screen.getByRole('menu', { name: 'Folder actions' });
		// Clamped into the viewport.
		expect(parseInt(menu.style.left)).toBeLessThan(window.innerWidth);
		expect(parseInt(menu.style.top)).toBeLessThan(window.innerHeight);

		await userEvent.click(document.body);
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();

		const trigger = within(folderItem('work') as HTMLElement).getByTestId(
			'folder-context-menu-trigger'
		);
		await fireEvent.keyDown(trigger, { key: 'Enter' });
		expect(screen.getByRole('menu')).toBeInTheDocument();
	});

	it('suppresses context menus on empty tree space and when disabled', async () => {
		const { unmount } = renderTree();
		await fireEvent.contextMenu(folderItem('work'));
		expect(screen.getByRole('menu')).toBeInTheDocument();
		await fireEvent.contextMenu(screen.getByRole('tree'));
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
		unmount();

		renderTree({ enableContextMenu: false });
		expect(screen.queryByTestId('folder-context-menu-trigger')).not.toBeInTheDocument();
		await fireEvent.contextMenu(folderItem('work'));
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});

	it('offers export-all on the root folder menu and hides rename/delete there', async () => {
		const onexportall = vi.fn();
		renderTree({ showPages: true, onexportall });
		await fireEvent.contextMenu(folderItem('/'));
		const menu = screen.getByRole('menu', { name: 'Folder actions' });
		expect(within(menu).queryByText('Rename')).not.toBeInTheDocument();
		expect(within(menu).queryByText('Delete')).not.toBeInTheDocument();
		await userEvent.click(within(menu).getByText('Export'));
		expect(onexportall).toHaveBeenCalledTimes(1);
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
			return screen.getByRole('menu');
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

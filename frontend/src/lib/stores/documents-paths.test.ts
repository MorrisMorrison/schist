import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Document } from '$lib/api/types';

vi.mock('$lib/api/client', () => ({
	apiClient: {
		getDocuments: vi.fn(),
		getDocumentByPath: vi.fn(),
		updateDocumentByPath: vi.fn(),
		deleteDocumentByPath: vi.fn(),
		moveDocument: vi.fn(),
		getFolderTree: vi.fn(),
		createFolder: vi.fn(),
		renameFolder: vi.fn(),
		deleteFolder: vi.fn(),
		moveFolder: vi.fn(),
		getDocumentBacklinks: vi.fn(),
		getDocumentOutgoingLinks: vi.fn(),
		checkDocumentExists: vi.fn()
	}
}));

import { apiClient } from '$lib/api/client';
import {
	currentFolder,
	documentActions,
	documentsStore,
	folderActions,
	foldersStore,
	linksStore,
	resetAllState,
	setDocumentsState,
	setFoldersState,
	setLinksState,
	setCurrentFolderState
} from './documents.svelte';

const api = vi.mocked(apiClient);
const doc = (path: string, title = path) =>
	({ metaData: { title, path, slug: path.split('/').pop() }, content: '' }) as Document;
const apiError = (error: string, code: string) => new Error(JSON.stringify({ error, code }));
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('documents store: path-based actions, folders and links', () => {
	beforeEach(() => {
		resetAllState();
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		api.getDocuments.mockResolvedValue([]);
		api.getFolderTree.mockResolvedValue([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('loadDocumentByPath', () => {
		it('sets the current document and folder', async () => {
			api.getDocumentByPath.mockResolvedValueOnce(doc('/a/b/c'));

			await documentActions.loadDocumentByPath('/a/b/c');

			expect(documentsStore.currentDocument?.metaData.path).toBe('/a/b/c');
			expect(currentFolder.value).toBe('/a/b');
			expect(documentsStore.loading).toBe(false);
		});

		it('clears the current document and stores the API message on failure', async () => {
			setDocumentsState({ currentDocument: doc('/x') });
			api.getDocumentByPath.mockRejectedValueOnce(apiError('Not here', 'RESOURCE_NOT_FOUND'));

			await expect(documentActions.loadDocumentByPath('/missing')).rejects.toThrow();

			expect(documentsStore.currentDocument).toBeNull();
			expect(documentsStore.error).toBe('Not here');
		});
	});

	describe('updateDocumentByPath', () => {
		it('replaces the document in place when the path is unchanged', async () => {
			const old = doc('/a', 'Old');
			const updated = doc('/a', 'New');
			setDocumentsState({ documents: [old, doc('/b')], currentDocument: old });
			api.updateDocumentByPath.mockResolvedValueOnce(updated);

			await expect(
				documentActions.updateDocumentByPath('/a', { content: 'x' } as never, 'auto')
			).resolves.toEqual(updated);

			expect(api.updateDocumentByPath).toHaveBeenCalledWith('/a', { content: 'x' }, 'auto');
			expect(documentsStore.documents.map((d) => d.metaData.title)).toEqual(['New', '/b']);
			expect(documentsStore.currentDocument?.metaData.title).toBe('New');
			expect(documentsStore.loading).toBe(false);
			await flush();
			expect(api.getFolderTree).toHaveBeenCalledWith(true);
			expect(api.getDocuments).not.toHaveBeenCalled();
		});

		it('reloads documents and folders when a save renamed the document', async () => {
			api.updateDocumentByPath.mockResolvedValueOnce(doc('/renamed'));
			api.getDocuments.mockResolvedValueOnce([doc('/renamed')]);

			await documentActions.updateDocumentByPath('/old', { content: '' } as never);

			expect(api.updateDocumentByPath).toHaveBeenCalledWith('/old', { content: '' }, 'manual');
			expect(api.getDocuments).toHaveBeenCalledWith(true);
			expect(api.getFolderTree).toHaveBeenCalledWith(true);
			expect(documentsStore.documents.map((d) => d.metaData.path)).toEqual(['/renamed']);
		});

		it('stores the API message on failure', async () => {
			api.updateDocumentByPath.mockRejectedValueOnce(apiError('Conflict', 'RESOURCE_CONFLICT'));

			await expect(documentActions.updateDocumentByPath('/a', {} as never)).rejects.toThrow();

			expect(documentsStore.error).toBe('Conflict');
			expect(documentsStore.loading).toBe(false);
		});
	});

	it('deleteDocumentByPath removes the document and clears it if current', async () => {
		const target = doc('/a');
		setDocumentsState({ documents: [target, doc('/b')], currentDocument: target });
		api.deleteDocumentByPath.mockResolvedValueOnce();

		await documentActions.deleteDocumentByPath('/a');

		expect(documentsStore.documents.map((d) => d.metaData.path)).toEqual(['/b']);
		expect(documentsStore.currentDocument).toBeNull();
	});

	it('moveDocumentPath reloads and follows the document to its new folder', async () => {
		api.moveDocument.mockResolvedValueOnce({ newPath: '/new/place/doc' } as never);

		await documentActions.moveDocumentPath('/old/doc', '/new/place/doc');

		expect(api.moveDocument).toHaveBeenCalledWith({
			oldPath: '/old/doc',
			newPath: '/new/place/doc'
		});
		expect(api.getDocuments).toHaveBeenCalledWith(true);
		expect(api.getFolderTree).toHaveBeenCalledWith(true);
		expect(currentFolder.value).toBe('/new/place');
	});

	it('checkDocumentExists treats errors as not existing', async () => {
		api.checkDocumentExists.mockResolvedValueOnce(true);
		await expect(documentActions.checkDocumentExists('/a')).resolves.toBe(true);

		api.checkDocumentExists.mockRejectedValueOnce(apiError('x', 'INTERNAL_ERROR'));
		await expect(documentActions.checkDocumentExists('/a')).resolves.toBe(false);
	});

	describe('links', () => {
		it('loads backlinks and outgoing links', async () => {
			api.getDocumentBacklinks.mockResolvedValueOnce([doc('/src')]);
			api.getDocumentOutgoingLinks.mockResolvedValueOnce([{ target: 'b' }] as never);

			await documentActions.loadBacklinks('/a');
			await documentActions.loadOutgoingLinks('/a');

			expect(api.getDocumentBacklinks).toHaveBeenCalledWith('/a');
			expect(linksStore.backlinks).toHaveLength(1);
			expect(linksStore.outgoingLinks).toEqual([{ target: 'b' }]);
			expect(linksStore.backlinksLoading).toBe(false);
			expect(linksStore.outgoingLinksLoading).toBe(false);
		});

		it('records link loading failures without throwing', async () => {
			api.getDocumentBacklinks.mockRejectedValueOnce(apiError('No index', 'INTERNAL_ERROR'));
			await documentActions.loadBacklinks('/a');
			expect(linksStore.error).toBe('No index');
			expect(linksStore.backlinksLoading).toBe(false);

			api.getDocumentOutgoingLinks.mockRejectedValueOnce(new Error(''));
			await documentActions.loadOutgoingLinks('/a');
			expect(linksStore.error).toBe('Failed to load outgoing links');
			expect(linksStore.outgoingLinksLoading).toBe(false);
		});
	});

	describe('folder actions', () => {
		it('loads the tree, forwarding force', async () => {
			api.getFolderTree.mockResolvedValueOnce([{ path: '/f' }] as never);

			await folderActions.loadFolderTree();

			expect(api.getFolderTree).toHaveBeenCalledWith(false);
			expect(foldersStore.folders).toEqual([{ path: '/f' }]);
		});

		it('creates a folder and reloads only the tree', async () => {
			api.createFolder.mockResolvedValueOnce({ message: 'ok' } as never);

			await folderActions.createFolder('/new');

			expect(api.createFolder).toHaveBeenCalledWith('/new');
			expect(api.getFolderTree).toHaveBeenCalledWith(true);
			expect(api.getDocuments).not.toHaveBeenCalled();
		});

		it.each([
			['renameFolder', () => folderActions.renameFolder('/f', 'g'), 'renameFolder', ['/f', 'g']],
			['deleteFolder', () => folderActions.deleteFolder('/f'), 'deleteFolder', ['/f']],
			[
				'moveFolder',
				() => folderActions.moveFolder('/f', '/x/f'),
				'moveFolder',
				[{ oldPath: '/f', newPath: '/x/f' }]
			]
		] as const)('%s reloads the tree and the documents', async (_n, run, method, args) => {
			vi.mocked(api[method]).mockResolvedValueOnce({ message: 'ok' } as never);

			await run();

			expect(api[method]).toHaveBeenCalledWith(...args);
			expect(api.getFolderTree).toHaveBeenCalledWith(true);
			expect(api.getDocuments).toHaveBeenCalledWith(true);
		});

		it('stores the API message on failure and can clear it', async () => {
			api.deleteFolder.mockRejectedValueOnce(apiError('Folder not empty', 'RESOURCE_CONFLICT'));

			await expect(folderActions.deleteFolder('/f')).rejects.toThrow();

			expect(foldersStore.error).toBe('Folder not empty');
			expect(foldersStore.loading).toBe(false);
			folderActions.clearError();
			expect(foldersStore.error).toBeNull();
		});
	});

	it('exposes test helpers that set state directly', () => {
		setFoldersState({ folders: [{ path: '/z' }] as never });
		setLinksState({ backlinks: [doc('/q')] });
		setCurrentFolderState('/deep');
		currentFolder.set('/deeper');

		expect(foldersStore.folders).toHaveLength(1);
		expect(linksStore.backlinks).toHaveLength(1);
		expect(currentFolder.value).toBe('/deeper');
	});
});

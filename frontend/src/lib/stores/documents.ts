import { writable, derived, get } from 'svelte/store';
import { apiClient } from '../api/client.js';
import type {
	Document,
	CreateDocumentRequest,
	UpdateDocumentRequest,
	Folder,
	MoveDocumentRequest
} from '../api/types.js';
import { getParentPath } from '../utils/path.js';

interface DocumentsState {
	documents: Document[];
	currentDocument: Document | null;
	loading: boolean;
	error: string | null;
}

interface SearchState {
	query: string;
	selectedTags: string[];
	results: Document[];
	loading: boolean;
	error: string | null;
}

interface FoldersState {
	folders: Folder[];
	loading: boolean;
	error: string | null;
}

export const documentsStore = writable<DocumentsState>({
	documents: [],
	currentDocument: null,
	loading: false,
	error: null
});

export const searchStore = writable<SearchState>({
	query: '',
	selectedTags: [],
	results: [],
	loading: false,
	error: null
});

export const foldersStore = writable<FoldersState>({
	folders: [],
	loading: true,
	error: null
});

export const documents = derived(documentsStore, ($store) => $store.documents);
export const currentDocument = derived(documentsStore, ($store) => $store.currentDocument);
export const isLoading = derived(documentsStore, ($store) => $store.loading);
export const error = derived(documentsStore, ($store) => $store.error);

export const searchQuery = derived(searchStore, ($store) => $store.query);
export const selectedTags = derived(searchStore, ($store) => $store.selectedTags);
export const searchResults = derived(searchStore, ($store) => $store.results);
export const isSearching = derived(searchStore, ($store) => $store.loading);

export const folders = derived(foldersStore, ($store) => $store.folders);
export const isFoldersLoading = derived(foldersStore, ($store) => $store.loading);
export const foldersError = derived(foldersStore, ($store) => $store.error);

export const currentFolder = writable<string>('/');

export const currentFolderDocuments = derived(
	[documentsStore, currentFolder],
	([$documentsStore, $currentFolder]) => {
		if (!$currentFolder || $currentFolder === '/') {
			return $documentsStore.documents.filter(
				(document) =>
					!document.metaData.path ||
					document.metaData.path === '/' ||
					!document.metaData.path.includes('/', 1)
			);
		}

		return $documentsStore.documents.filter(
			(document) =>
				document.metaData.path &&
				document.metaData.path.startsWith($currentFolder) &&
				document.metaData.path !== $currentFolder
		);
	}
);

export const documentActions = {
	async loadDocuments() {
		documentsStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const documents = (await apiClient.getDocuments()) ?? [];
			documentsStore.update((state) => ({
				...state,
				documents,
				loading: false
			}));
		} catch (error) {
			documentsStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load documents'
			}));
		}
	},

	async loadDocument(identifier: string) {
		documentsStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			let document: Document;

			if (identifier.startsWith('/')) {
				document = await apiClient.getDocumentByPath(identifier);
				currentFolder.set(getParentPath(document.metaData.path));
			} else {
				document = await apiClient.getDocument(identifier);
				if (document.metaData.path) {
					currentFolder.set(getParentPath(document.metaData.path));
				}
			}

			documentsStore.update((state) => ({
				...state,
				currentDocument: document,
				loading: false
			}));
			return document;
		} catch (error) {
			documentsStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load document',
				currentDocument: null
			}));
			throw error;
		}
	},

	async createDocument(documentData: CreateDocumentRequest) {
		documentsStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const response = await apiClient.createDocument(documentData);
			const newDocument = await apiClient.getDocumentByPath(response.path);

			documentsStore.update((state) => ({
				...state,
				documents: [...state.documents, newDocument],
				currentDocument: newDocument,
				loading: false
			}));

			if (newDocument.metaData?.path) {
				const parentPath = getParentPath(newDocument.metaData.path);
				currentFolder.set(parentPath);
			}

			if (documentData.metaData.path) {
				folderActions.loadFolderTree().catch(console.error);
			}

			return newDocument;
		} catch (error) {
			documentsStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to create document'
			}));
			throw error;
		}
	},

	async updateDocument(slug: string, documentData: UpdateDocumentRequest) {
		documentsStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const updatedDocument = await apiClient.updateDocument(slug, documentData);
			documentsStore.update((state) => ({
				...state,
				documents: state.documents.map((d) => (d.metaData.slug === slug ? updatedDocument : d)),
				currentDocument:
					state.currentDocument?.metaData.slug === slug ? updatedDocument : state.currentDocument,
				loading: false
			}));
			return updatedDocument;
		} catch (error) {
			documentsStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to update document'
			}));
			throw error;
		}
	},

	async deleteDocument(path: string) {
		documentsStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			await apiClient.deleteDocumentByPath(path);
			documentsStore.update((state) => ({
				...state,
				documents: state.documents.filter((d) => d.metaData.path !== path),
				currentDocument:
					state.currentDocument?.metaData.path === path ? null : state.currentDocument,
				loading: false
			}));

			folderActions.loadFolderTree().catch(console.error);
			documentActions.loadDocuments().catch(console.error);
		} catch (error) {
			documentsStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to delete document'
			}));
			throw error;
		}
	},

	async loadDocumentByPath(path: string) {
		documentsStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const document = await apiClient.getDocumentByPath(path);
			documentsStore.update((state) => ({
				...state,
				currentDocument: document,
				loading: false
			}));

			currentFolder.set(getParentPath(document.metaData.path));

			return document;
		} catch (error) {
			documentsStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load document',
				currentDocument: null
			}));
			throw error;
		}
	},

	async updateDocumentByPath(
		path: string,
		documentData: UpdateDocumentRequest,
		saveType: 'manual' | 'auto' = 'manual'
	) {
		documentsStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const updatedDocument = await apiClient.updateDocumentByPath(path, documentData, saveType);

			const pathChanged = updatedDocument.metaData.path !== path;

			if (pathChanged) {
				await Promise.all([documentActions.loadDocuments(), folderActions.loadFolderTree()]);
			} else {
				documentsStore.update((state) => ({
					...state,
					documents: state.documents.map((d) => (d.metaData.path === path ? updatedDocument : d)),
					currentDocument:
						state.currentDocument?.metaData.path === path ? updatedDocument : state.currentDocument,
					loading: false
				}));
			}

			return updatedDocument;
		} catch (error) {
			documentsStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to update document'
			}));
			throw error;
		}
	},

	async deleteDocumentByPath(path: string) {
		documentsStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			await apiClient.deleteDocumentByPath(path);
			documentsStore.update((state) => ({
				...state,
				documents: state.documents.filter((d) => d.metaData.path !== path),
				currentDocument:
					state.currentDocument?.metaData.path === path ? null : state.currentDocument,
				loading: false
			}));

			folderActions.loadFolderTree().catch(console.error);
		} catch (error) {
			documentsStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to delete document'
			}));
			throw error;
		}
	},

	async moveDocumentPath(oldPath: string, newPath: string) {
		documentsStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const moveRequest: MoveDocumentRequest = { oldPath, newPath };
			const result = await apiClient.moveDocument(moveRequest);

			await Promise.all([documentActions.loadDocuments(), folderActions.loadFolderTree()]);

			currentFolder.set(getParentPath(newPath));

			documentsStore.update((state) => ({ ...state, loading: false }));
			return result;
		} catch (error) {
			documentsStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to move document'
			}));
			throw error;
		}
	},

	clearCurrentDocument() {
		documentsStore.update((state) => ({ ...state, currentDocument: null }));
	},

	clearError() {
		documentsStore.update((state) => ({ ...state, error: null }));
	}
};

function buildSearchQuery(textQuery: string, tags: string[]): string {
	const parts: string[] = [];

	if (textQuery.trim()) {
		parts.push(textQuery.trim());
	}

	for (const tag of tags) {
		parts.push(`tag:${tag}`);
	}

	return parts.join(' ');
}

export const searchActions = {
	async search(query?: string, tags?: string[]) {
		const currentState = get(searchStore);
		const finalQuery = query ?? currentState.query;
		const finalTags = tags ?? currentState.selectedTags;

		searchStore.update((state) => ({
			...state,
			query: finalQuery,
			selectedTags: finalTags,
			loading: true,
			error: null
		}));

		try {
			const combinedQuery = buildSearchQuery(finalQuery, finalTags);
			const results = await apiClient.searchDocuments(combinedQuery);

			searchStore.update((state) => ({
				...state,
				results: results.documents,
				loading: false
			}));
			return results;
		} catch (error) {
			searchStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Search failed',
				results: []
			}));
			throw error;
		}
	},

	clearSearch() {
		searchStore.update((state) => ({
			...state,
			query: '',
			selectedTags: [],
			results: [],
			error: null
		}));
	},

	setQuery(query: string) {
		searchStore.update((state) => ({ ...state, query }));
	},

	setSelectedTags(tags: string[]) {
		searchStore.update((state) => ({ ...state, selectedTags: tags }));
	},

	addTag(tag: string) {
		searchStore.update((state) => {
			const newTags = state.selectedTags.includes(tag)
				? state.selectedTags
				: [...state.selectedTags, tag];
			return { ...state, selectedTags: newTags };
		});
	},

	removeTag(tag: string) {
		searchStore.update((state) => ({
			...state,
			selectedTags: state.selectedTags.filter((t) => t !== tag)
		}));
	},

	clearTags() {
		searchStore.update((state) => ({ ...state, selectedTags: [] }));
	},

	async performSearch() {
		const currentState = get(searchStore);
		return this.search(currentState.query, currentState.selectedTags);
	},

	async searchInFolder(query: string, folderPath: string) {
		searchStore.update((state) => ({
			...state,
			query,
			loading: true,
			error: null
		}));

		try {
			const allResults = await apiClient.searchDocuments(query);
			const results = allResults.documents.filter(
				(document) => document.metaData.path && document.metaData.path.startsWith(folderPath)
			);

			searchStore.update((state) => ({
				...state,
				results,
				loading: false
			}));
			return results;
		} catch (error) {
			searchStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Search failed',
				results: []
			}));
			throw error;
		}
	}
};

export const folderActions = {
	async loadFolderTree() {
		foldersStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const folders = await apiClient.getFolderTree();
			foldersStore.update((state) => ({
				...state,
				folders,
				loading: false
			}));
			return folders;
		} catch (error) {
			foldersStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load folder tree'
			}));
			throw error;
		}
	},

	async createFolder(path: string) {
		foldersStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const result = await apiClient.createFolder(path);

			await folderActions.loadFolderTree();

			foldersStore.update((state) => ({ ...state, loading: false }));
			return result;
		} catch (error) {
			foldersStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to create folder'
			}));
			throw error;
		}
	},

	async renameFolder(path: string, newName: string) {
		foldersStore.update((state) => ({ ...state, loading: true, error: null }));
		try {
			const result = await apiClient.renameFolder(path, newName);
			await Promise.all([folderActions.loadFolderTree(), documentActions.loadDocuments()]);
			foldersStore.update((state) => ({ ...state, loading: false }));
			return result;
		} catch (error) {
			foldersStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to rename folder'
			}));
			throw error;
		}
	},

	async deleteFolder(path: string) {
		foldersStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const result = await apiClient.deleteFolder(path);

			await Promise.all([folderActions.loadFolderTree(), documentActions.loadDocuments()]);

			foldersStore.update((state) => ({ ...state, loading: false }));
			return result;
		} catch (error) {
			foldersStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to delete folder'
			}));
			throw error;
		}
	},

	async moveFolder(oldPath: string, newPath: string) {
		foldersStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const moveRequest: MoveDocumentRequest = { oldPath, newPath };
			const result = await apiClient.moveFolder(moveRequest);

			await Promise.all([folderActions.loadFolderTree(), documentActions.loadDocuments()]);

			foldersStore.update((state) => ({ ...state, loading: false }));
			return result;
		} catch (error) {
			foldersStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to move folder'
			}));
			throw error;
		}
	},

	clearError() {
		foldersStore.update((state) => ({ ...state, error: null }));
	}
};

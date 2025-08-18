import { browser } from '$app/environment';
import { apiClient } from '../api/client.js';
import type {
	Document,
	CreateDocumentRequest,
	UpdateDocumentRequest,
	Folder,
	MoveDocumentRequest,
	WikiLink
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

interface LinksState {
	backlinks: Document[];
	outgoingLinks: WikiLink[];
	backlinksLoading: boolean;
	outgoingLinksLoading: boolean;
	error: string | null;
}

const defaultDocumentsState: DocumentsState = {
	documents: [],
	currentDocument: null,
	loading: false,
	error: null
};

const defaultSearchState: SearchState = {
	query: '',
	selectedTags: [],
	results: [],
	loading: false,
	error: null
};

const defaultFoldersState: FoldersState = {
	folders: [],
	loading: false,
	error: null
};

const defaultLinksState: LinksState = {
	backlinks: [],
	outgoingLinks: [],
	backlinksLoading: false,
	outgoingLinksLoading: false,
	error: null
};

let documentsState: DocumentsState = defaultDocumentsState;
let searchState: SearchState = defaultSearchState;
let foldersState: FoldersState = defaultFoldersState;
let linksState: LinksState = defaultLinksState;
let currentFolderState: string = '/';

if (browser) {
	documentsState = $state<DocumentsState>(defaultDocumentsState);
	searchState = $state<SearchState>(defaultSearchState);
	foldersState = $state<FoldersState>(defaultFoldersState);
	linksState = $state<LinksState>(defaultLinksState);
	currentFolderState = $state<string>('/');
}

// Helper functions for state updates that work in both browser and test environments
function updateDocumentsState(updates: Partial<DocumentsState>) {
	if (browser) {
		Object.assign(documentsState, updates);
	} else {
		Object.assign(documentsState, updates);
	}
}

function updateSearchState(updates: Partial<SearchState>) {
	if (browser) {
		Object.assign(searchState, updates);
	} else {
		Object.assign(searchState, updates);
	}
}

function updateFoldersState(updates: Partial<FoldersState>) {
	if (browser) {
		Object.assign(foldersState, updates);
	} else {
		Object.assign(foldersState, updates);
	}
}

function updateLinksState(updates: Partial<LinksState>) {
	if (browser) {
		Object.assign(linksState, updates);
	} else {
		Object.assign(linksState, updates);
	}
}

function setCurrentFolder(value: string) {
	if (browser) {
		currentFolderState = value;
	} else {
		currentFolderState = value;
	}
}

function createDocumentActions() {
	return {
		async loadDocuments(force = false) {
			updateDocumentsState({ loading: true, error: null });

			try {
				const documents = (await apiClient.getDocuments(force)) ?? [];
				updateDocumentsState({ documents, loading: false });
				return documents;
			} catch (error) {
				updateDocumentsState({
					documents: [],
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load documents'
				});
				return [];
			}
		},

		async loadDocument(identifier: string) {
			updateDocumentsState({ loading: true, error: null });

			try {
				let document: Document;

				if (identifier.startsWith('/')) {
					document = await apiClient.getDocumentByPath(identifier);
					setCurrentFolder(getParentPath(document.metaData.path));
				} else {
					document = await apiClient.getDocument(identifier);
					if (document.metaData.path) {
						setCurrentFolder(getParentPath(document.metaData.path));
					}
				}

				updateDocumentsState({ currentDocument: document, loading: false });
				return document;
			} catch (error) {
				updateDocumentsState({
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load document',
					currentDocument: null
				});
				throw error;
			}
		},

		async createDocument(documentData: CreateDocumentRequest) {
			updateDocumentsState({ loading: true, error: null });

			try {
				const response = await apiClient.createDocument(documentData);
				const newDocument = await apiClient.getDocumentByPath(response.path);

				updateDocumentsState({
					documents: [...documentsState.documents, newDocument],
					currentDocument: newDocument,
					loading: false
				});

				if (newDocument.metaData?.path) {
					const parentPath = getParentPath(newDocument.metaData.path);
					setCurrentFolder(parentPath);
				}

				if (documentData.metaData.path) {
					folderActions.loadFolderTree(true).catch(console.error);
				}

				return newDocument;
			} catch (error) {
				updateDocumentsState({
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to create document'
				});
				throw error;
			}
		},

		async updateDocument(slug: string, documentData: UpdateDocumentRequest) {
			updateDocumentsState({ loading: true, error: null });

			try {
				const updatedDocument = await apiClient.updateDocument(slug, documentData);
				updateDocumentsState({
					documents: documentsState.documents.map((d) =>
						d.metaData.slug === slug ? updatedDocument : d
					),
					currentDocument:
						documentsState.currentDocument?.metaData.slug === slug
							? updatedDocument
							: documentsState.currentDocument,
					loading: false
				});

				// Force folder tree refresh to update document counts and metadata
				folderActions.loadFolderTree(true).catch(console.error);
				return updatedDocument;
			} catch (error) {
				updateDocumentsState({
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to update document'
				});
				throw error;
			}
		},

		async deleteDocument(path: string) {
			updateDocumentsState({ loading: true, error: null });

			try {
				await apiClient.deleteDocumentByPath(path);
				updateDocumentsState({
					documents: documentsState.documents.filter((d) => d.metaData.path !== path),
					currentDocument:
						documentsState.currentDocument?.metaData.path === path
							? null
							: documentsState.currentDocument,
					loading: false
				});

				folderActions.loadFolderTree(true).catch(console.error);
				documentActions.loadDocuments(true).catch(console.error);
			} catch (error) {
				updateDocumentsState({
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to delete document'
				});
				throw error;
			}
		},

		async loadDocumentByPath(path: string) {
			if (browser) {
				documentsState.loading = true;
				documentsState.error = null;
			}

			try {
				const document = await apiClient.getDocumentByPath(path);
				if (browser) {
					documentsState.currentDocument = document;
					documentsState.loading = false;
				}

				setCurrentFolder(getParentPath(document.metaData.path));

				return document;
			} catch (error) {
				if (browser) {
					documentsState.loading = false;
					documentsState.error = error instanceof Error ? error.message : 'Failed to load document';
					documentsState.currentDocument = null;
				}
				throw error;
			}
		},

		async updateDocumentByPath(
			path: string,
			documentData: UpdateDocumentRequest,
			saveType: 'manual' | 'auto' = 'manual'
		) {
			if (browser) {
				documentsState.loading = true;
				documentsState.error = null;
			}

			try {
				const updatedDocument = await apiClient.updateDocumentByPath(path, documentData, saveType);

				const pathChanged = updatedDocument.metaData.path !== path;

				if (pathChanged) {
					await Promise.all([
						documentActions.loadDocuments(true),
						folderActions.loadFolderTree(true)
					]);
				} else {
					if (browser) {
						documentsState.documents = documentsState.documents.map((d) =>
							d.metaData.path === path ? updatedDocument : d
						);
						documentsState.currentDocument =
							documentsState.currentDocument?.metaData.path === path
								? updatedDocument
								: documentsState.currentDocument;
						documentsState.loading = false;
					}

					// Force folder tree refresh to update document counts and metadata
					folderActions.loadFolderTree(true).catch(console.error);
				}

				return updatedDocument;
			} catch (error) {
				if (browser) {
					documentsState.loading = false;
					documentsState.error =
						error instanceof Error ? error.message : 'Failed to update document';
				}
				throw error;
			}
		},

		async deleteDocumentByPath(path: string) {
			if (browser) {
				documentsState.loading = true;
				documentsState.error = null;
			}

			try {
				await apiClient.deleteDocumentByPath(path);
				if (browser) {
					documentsState.documents = documentsState.documents.filter(
						(d) => d.metaData.path !== path
					);
					documentsState.currentDocument =
						documentsState.currentDocument?.metaData.path === path
							? null
							: documentsState.currentDocument;
					documentsState.loading = false;
				}

				folderActions.loadFolderTree(true).catch(console.error);
			} catch (error) {
				if (browser) {
					documentsState.loading = false;
					documentsState.error =
						error instanceof Error ? error.message : 'Failed to delete document';
				}
				throw error;
			}
		},

		async moveDocumentPath(oldPath: string, newPath: string) {
			if (browser) {
				documentsState.loading = true;
				documentsState.error = null;
			}

			try {
				const moveRequest: MoveDocumentRequest = { oldPath, newPath };
				const result = await apiClient.moveDocument(moveRequest);

				await Promise.all([
					documentActions.loadDocuments(true),
					folderActions.loadFolderTree(true)
				]);

				setCurrentFolder(getParentPath(newPath));

				if (browser) {
					documentsState.loading = false;
				}
				return result;
			} catch (error) {
				if (browser) {
					documentsState.loading = false;
					documentsState.error = error instanceof Error ? error.message : 'Failed to move document';
				}
				throw error;
			}
		},

		clearCurrentDocument() {
			updateDocumentsState({ currentDocument: null });
		},

		clearError() {
			updateDocumentsState({ error: null });
		},

		async loadBacklinks(documentPath: string) {
			if (browser) {
				linksState.backlinksLoading = true;
				linksState.error = null;
			}

			try {
				const backlinks = await apiClient.getDocumentBacklinks(documentPath);
				if (browser) {
					linksState.backlinks = backlinks;
					linksState.backlinksLoading = false;
				}
			} catch (error) {
				if (browser) {
					linksState.backlinksLoading = false;
					linksState.error = error instanceof Error ? error.message : 'Failed to load backlinks';
				}
			}
		},

		async loadOutgoingLinks(documentPath: string) {
			if (browser) {
				linksState.outgoingLinksLoading = true;
				linksState.error = null;
			}

			try {
				const outgoingLinks = await apiClient.getDocumentOutgoingLinks(documentPath);
				if (browser) {
					linksState.outgoingLinks = outgoingLinks;
					linksState.outgoingLinksLoading = false;
				}
			} catch (error) {
				if (browser) {
					linksState.outgoingLinksLoading = false;
					linksState.error =
						error instanceof Error ? error.message : 'Failed to load outgoing links';
				}
			}
		},

		async checkDocumentExists(path: string): Promise<boolean> {
			try {
				return await apiClient.checkDocumentExists(path);
			} catch {
				return false;
			}
		}
	};
}

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

function createSearchActions() {
	return {
		async search(query?: string, tags?: string[]) {
			const finalQuery = query ?? searchState.query;
			const finalTags = tags ?? searchState.selectedTags;

			updateSearchState({
				query: finalQuery,
				selectedTags: finalTags,
				loading: true,
				error: null
			});

			try {
				const combinedQuery = buildSearchQuery(finalQuery, finalTags);
				const results = await apiClient.searchDocuments(combinedQuery);

				updateSearchState({ results: results.documents, loading: false });
				return results;
			} catch (error) {
				updateSearchState({
					loading: false,
					error: error instanceof Error ? error.message : 'Search failed',
					results: []
				});
				throw error;
			}
		},

		clearSearch() {
			updateSearchState({
				query: '',
				selectedTags: [],
				results: [],
				error: null
			});
		},

		setQuery(query: string) {
			updateSearchState({ query });
		},

		setSelectedTags(tags: string[]) {
			updateSearchState({ selectedTags: tags });
		},

		addTag(tag: string) {
			if (!searchState.selectedTags.includes(tag)) {
				updateSearchState({ selectedTags: [...searchState.selectedTags, tag] });
			}
		},

		removeTag(tag: string) {
			updateSearchState({ selectedTags: searchState.selectedTags.filter((t) => t !== tag) });
		},

		clearTags() {
			updateSearchState({ selectedTags: [] });
		},

		async performSearch() {
			return this.search(searchState.query, searchState.selectedTags);
		},

		async searchInFolder(query: string, folderPath: string) {
			if (browser) {
				searchState.query = query;
				searchState.loading = true;
				searchState.error = null;
			}

			try {
				const allResults = await apiClient.searchDocuments(query);
				const results = allResults.documents.filter(
					(document) => document.metaData.path && document.metaData.path.startsWith(folderPath)
				);

				if (browser) {
					searchState.results = results;
					searchState.loading = false;
				}
				return results;
			} catch (error) {
				if (browser) {
					searchState.loading = false;
					searchState.error = error instanceof Error ? error.message : 'Search failed';
					searchState.results = [];
				}
				throw error;
			}
		}
	};
}

function createFolderActions() {
	return {
		async loadFolderTree(force = false) {
			if (browser) {
				foldersState.loading = true;
				foldersState.error = null;
			}

			try {
				const folders = await apiClient.getFolderTree(force);
				if (browser) {
					foldersState.folders = folders;
					foldersState.loading = false;
				}
				return folders;
			} catch (error) {
				if (browser) {
					foldersState.loading = false;
					foldersState.error =
						error instanceof Error ? error.message : 'Failed to load folder tree';
				}
				throw error;
			}
		},

		async createFolder(path: string) {
			if (browser) {
				foldersState.loading = true;
				foldersState.error = null;
			}

			try {
				const result = await apiClient.createFolder(path);

				await folderActions.loadFolderTree(true);

				if (browser) {
					foldersState.loading = false;
				}
				return result;
			} catch (error) {
				if (browser) {
					foldersState.loading = false;
					foldersState.error = error instanceof Error ? error.message : 'Failed to create folder';
				}
				throw error;
			}
		},

		async renameFolder(path: string, newName: string) {
			if (browser) {
				foldersState.loading = true;
				foldersState.error = null;
			}
			try {
				const result = await apiClient.renameFolder(path, newName);
				await Promise.all([
					folderActions.loadFolderTree(true),
					documentActions.loadDocuments(true)
				]);
				if (browser) {
					foldersState.loading = false;
				}
				return result;
			} catch (error) {
				if (browser) {
					foldersState.loading = false;
					foldersState.error = error instanceof Error ? error.message : 'Failed to rename folder';
				}
				throw error;
			}
		},

		async deleteFolder(path: string) {
			if (browser) {
				foldersState.loading = true;
				foldersState.error = null;
			}

			try {
				const result = await apiClient.deleteFolder(path);

				await Promise.all([
					folderActions.loadFolderTree(true),
					documentActions.loadDocuments(true)
				]);

				if (browser) {
					foldersState.loading = false;
				}
				return result;
			} catch (error) {
				if (browser) {
					foldersState.loading = false;
					foldersState.error = error instanceof Error ? error.message : 'Failed to delete folder';
				}
				throw error;
			}
		},

		async moveFolder(oldPath: string, newPath: string) {
			if (browser) {
				foldersState.loading = true;
				foldersState.error = null;
			}

			try {
				const moveRequest: MoveDocumentRequest = { oldPath, newPath };
				const result = await apiClient.moveFolder(moveRequest);

				await Promise.all([
					folderActions.loadFolderTree(true),
					documentActions.loadDocuments(true)
				]);

				if (browser) {
					foldersState.loading = false;
				}
				return result;
			} catch (error) {
				if (browser) {
					foldersState.loading = false;
					foldersState.error = error instanceof Error ? error.message : 'Failed to move folder';
				}
				throw error;
			}
		},

		clearError() {
			if (browser) {
				foldersState.error = null;
			}
		}
	};
}

export const documentsStore = {
	get documents() {
		return documentsState.documents;
	},
	get currentDocument() {
		return documentsState.currentDocument;
	},
	get loading() {
		return documentsState.loading;
	},
	get error() {
		return documentsState.error;
	}
};

export const searchStore = {
	get query() {
		return searchState.query;
	},
	get selectedTags() {
		return searchState.selectedTags;
	},
	get results() {
		return searchState.results;
	},
	get loading() {
		return searchState.loading;
	},
	get error() {
		return searchState.error;
	}
};

export const foldersStore = {
	get folders() {
		return foldersState.folders;
	},
	get loading() {
		return foldersState.loading;
	},
	get error() {
		return foldersState.error;
	}
};

export const linksStore = {
	get backlinks() {
		return linksState.backlinks;
	},
	get outgoingLinks() {
		return linksState.outgoingLinks;
	},
	get backlinksLoading() {
		return linksState.backlinksLoading;
	},
	get outgoingLinksLoading() {
		return linksState.outgoingLinksLoading;
	},
	get error() {
		return linksState.error;
	}
};

export const currentFolder = {
	get value() {
		return currentFolderState;
	},
	set(value: string) {
		setCurrentFolder(value);
	}
};

export const currentFolderDocuments = () => {
	if (!currentFolderState || currentFolderState === '/') {
		return documentsState.documents.filter(
			(document) =>
				!document.metaData.path ||
				document.metaData.path === '/' ||
				!document.metaData.path.includes('/', 1)
		);
	}

	return documentsState.documents.filter(
		(document) =>
			document.metaData.path &&
			document.metaData.path.startsWith(currentFolderState) &&
			document.metaData.path !== currentFolderState
	);
};

// Convenience exports
export const documents = () => documentsState.documents;
export const currentDocument = () => documentsState.currentDocument;
export const isLoading = () => documentsState.loading;
export const error = () => documentsState.error;

export const searchQuery = () => searchState.query;
export const selectedTags = () => searchState.selectedTags;
export const searchResults = () => searchState.results;
export const isSearching = () => searchState.loading;

export const folders = () => foldersState.folders;
export const isFoldersLoading = () => foldersState.loading;
export const foldersError = () => foldersState.error;

export const backlinks = () => linksState.backlinks;
export const outgoingLinks = () => linksState.outgoingLinks;
export const isBacklinksLoading = () => linksState.backlinksLoading;
export const isOutgoingLinksLoading = () => linksState.outgoingLinksLoading;
export const linksError = () => linksState.error;

// Action exports
export const documentActions = createDocumentActions();
export const searchActions = createSearchActions();
export const folderActions = createFolderActions();

// Helper functions for tests
export function resetAllState() {
	// Reset documents state
	updateDocumentsState({
		documents: [],
		currentDocument: null,
		loading: false,
		error: null
	});

	// Reset search state
	updateSearchState({
		query: '',
		selectedTags: [],
		results: [],
		loading: false,
		error: null
	});

	// Reset folders state
	updateFoldersState({
		folders: [],
		loading: false,
		error: null
	});

	// Reset links state
	updateLinksState({
		backlinks: [],
		outgoingLinks: [],
		backlinksLoading: false,
		outgoingLinksLoading: false,
		error: null
	});

	setCurrentFolder('/');
}

export function setDocumentsState(state: Partial<DocumentsState>) {
	Object.assign(documentsState, state);
}

export function setSearchState(state: Partial<SearchState>) {
	Object.assign(searchState, state);
}

export function setFoldersState(state: Partial<FoldersState>) {
	Object.assign(foldersState, state);
}

export function setLinksState(state: Partial<LinksState>) {
	Object.assign(linksState, state);
}

export function setCurrentFolderState(folder: string) {
	setCurrentFolder(folder);
}

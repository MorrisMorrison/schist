import { apiClient } from '../api/client';
import type {
	Document,
	CreateDocumentRequest,
	UpdateDocumentRequest,
	Folder,
	MoveDocumentRequest,
	WikiLink
} from '../api/types';
import { getParentPath } from '../utils/path';
import { getErrorMessage } from '$lib/utils/error';

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

const documentsState: DocumentsState = $state<DocumentsState>(defaultDocumentsState);
const searchState: SearchState = $state<SearchState>(defaultSearchState);
const foldersState: FoldersState = $state<FoldersState>(defaultFoldersState);
const linksState: LinksState = $state<LinksState>(defaultLinksState);
let currentFolderState: string = $state<string>('/');

// Helper functions for state updates
function updateDocumentsState(updates: Partial<DocumentsState>) {
	Object.assign(documentsState, updates);
}

function updateSearchState(updates: Partial<SearchState>) {
	Object.assign(searchState, updates);
}

function updateFoldersState(updates: Partial<FoldersState>) {
	Object.assign(foldersState, updates);
}

function updateLinksState(updates: Partial<LinksState>) {
	Object.assign(linksState, updates);
}

function setCurrentFolder(value: string) {
	currentFolderState = value;
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
					error: getErrorMessage(error, 'Failed to load documents')
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
					error: getErrorMessage(error, 'Failed to load document'),
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
					error: getErrorMessage(error, 'Failed to create document')
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
					error: getErrorMessage(error, 'Failed to update document')
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
					error: getErrorMessage(error, 'Failed to delete document')
				});
				throw error;
			}
		},

		async loadDocumentByPath(path: string) {
			documentsState.loading = true;
			documentsState.error = null;

			try {
				const document = await apiClient.getDocumentByPath(path);
				documentsState.currentDocument = document;
				documentsState.loading = false;

				setCurrentFolder(getParentPath(document.metaData.path));

				return document;
			} catch (error) {
				documentsState.loading = false;
				documentsState.error = getErrorMessage(error, 'Failed to load document');
				documentsState.currentDocument = null;
				throw error;
			}
		},

		async updateDocumentByPath(
			path: string,
			documentData: UpdateDocumentRequest,
			saveType: 'manual' | 'auto' = 'manual'
		) {
			documentsState.loading = true;
			documentsState.error = null;

			try {
				const updatedDocument = await apiClient.updateDocumentByPath(path, documentData, saveType);

				const pathChanged = updatedDocument.metaData.path !== path;

				if (pathChanged) {
					await Promise.all([
						documentActions.loadDocuments(true),
						folderActions.loadFolderTree(true)
					]);
				} else {
					documentsState.documents = documentsState.documents.map((d) =>
						d.metaData.path === path ? updatedDocument : d
					);
					documentsState.currentDocument =
						documentsState.currentDocument?.metaData.path === path
							? updatedDocument
							: documentsState.currentDocument;
					documentsState.loading = false;

					// Force folder tree refresh to update document counts and metadata
					folderActions.loadFolderTree(true).catch(console.error);
				}

				return updatedDocument;
			} catch (error) {
				documentsState.loading = false;
				documentsState.error = getErrorMessage(error, 'Failed to update document');
				throw error;
			}
		},

		async deleteDocumentByPath(path: string) {
			documentsState.loading = true;
			documentsState.error = null;

			try {
				await apiClient.deleteDocumentByPath(path);
				documentsState.documents = documentsState.documents.filter((d) => d.metaData.path !== path);
				documentsState.currentDocument =
					documentsState.currentDocument?.metaData.path === path
						? null
						: documentsState.currentDocument;
				documentsState.loading = false;

				folderActions.loadFolderTree(true).catch(console.error);
			} catch (error) {
				documentsState.loading = false;
				documentsState.error = getErrorMessage(error, 'Failed to delete document');
				throw error;
			}
		},

		async moveDocumentPath(oldPath: string, newPath: string) {
			documentsState.loading = true;
			documentsState.error = null;

			try {
				const moveRequest: MoveDocumentRequest = { oldPath, newPath };
				const result = await apiClient.moveDocument(moveRequest);

				await Promise.all([
					documentActions.loadDocuments(true),
					folderActions.loadFolderTree(true)
				]);

				setCurrentFolder(getParentPath(newPath));

				documentsState.loading = false;
				return result;
			} catch (error) {
				documentsState.loading = false;
				documentsState.error = getErrorMessage(error, 'Failed to move document');
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
			linksState.backlinksLoading = true;
			linksState.error = null;

			try {
				const backlinks = await apiClient.getDocumentBacklinks(documentPath);
				linksState.backlinks = backlinks;
				linksState.backlinksLoading = false;
			} catch (error) {
				linksState.backlinksLoading = false;
				linksState.error = getErrorMessage(error, 'Failed to load backlinks');
			}
		},

		async loadOutgoingLinks(documentPath: string) {
			linksState.outgoingLinksLoading = true;
			linksState.error = null;

			try {
				const outgoingLinks = await apiClient.getDocumentOutgoingLinks(documentPath);
				linksState.outgoingLinks = outgoingLinks;
				linksState.outgoingLinksLoading = false;
			} catch (error) {
				linksState.outgoingLinksLoading = false;
				linksState.error = getErrorMessage(error, 'Failed to load outgoing links');
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
					error: getErrorMessage(error, 'Search failed'),
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
			searchState.query = query;
			searchState.loading = true;
			searchState.error = null;

			try {
				const allResults = await apiClient.searchDocuments(query);
				const results = allResults.documents.filter(
					(document) => document.metaData.path && document.metaData.path.startsWith(folderPath)
				);

				searchState.results = results;
				searchState.loading = false;
				return results;
			} catch (error) {
				searchState.loading = false;
				searchState.error = getErrorMessage(error, 'Search failed');
				searchState.results = [];
				throw error;
			}
		}
	};
}

function createFolderActions() {
	return {
		async loadFolderTree(force = false) {
			foldersState.loading = true;
			foldersState.error = null;

			try {
				const folders = await apiClient.getFolderTree(force);
				foldersState.folders = folders;
				foldersState.loading = false;
				return folders;
			} catch (error) {
				foldersState.loading = false;
				foldersState.error = getErrorMessage(error, 'Failed to load folder tree');
				throw error;
			}
		},

		async createFolder(path: string) {
			foldersState.loading = true;
			foldersState.error = null;

			try {
				const result = await apiClient.createFolder(path);

				await folderActions.loadFolderTree(true);

				foldersState.loading = false;
				return result;
			} catch (error) {
				foldersState.loading = false;
				foldersState.error = getErrorMessage(error, 'Failed to create folder');
				throw error;
			}
		},

		async renameFolder(path: string, newName: string) {
			foldersState.loading = true;
			foldersState.error = null;
			try {
				const result = await apiClient.renameFolder(path, newName);
				await Promise.all([
					folderActions.loadFolderTree(true),
					documentActions.loadDocuments(true)
				]);
				foldersState.loading = false;
				return result;
			} catch (error) {
				foldersState.loading = false;
				foldersState.error = getErrorMessage(error, 'Failed to rename folder');
				throw error;
			}
		},

		async deleteFolder(path: string) {
			foldersState.loading = true;
			foldersState.error = null;

			try {
				const result = await apiClient.deleteFolder(path);

				await Promise.all([
					folderActions.loadFolderTree(true),
					documentActions.loadDocuments(true)
				]);

				foldersState.loading = false;
				return result;
			} catch (error) {
				foldersState.loading = false;
				foldersState.error = getErrorMessage(error, 'Failed to delete folder');
				throw error;
			}
		},

		async moveFolder(oldPath: string, newPath: string) {
			foldersState.loading = true;
			foldersState.error = null;

			try {
				const moveRequest: MoveDocumentRequest = { oldPath, newPath };
				const result = await apiClient.moveFolder(moveRequest);

				await Promise.all([
					folderActions.loadFolderTree(true),
					documentActions.loadDocuments(true)
				]);

				foldersState.loading = false;
				return result;
			} catch (error) {
				foldersState.loading = false;
				foldersState.error = getErrorMessage(error, 'Failed to move folder');
				throw error;
			}
		},

		clearError() {
			foldersState.error = null;
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

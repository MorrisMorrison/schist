import { writable, derived } from 'svelte/store';
import { apiClient } from '../api/client.js';
import type {
	Page,
	CreatePageRequest,
	UpdatePageRequest,
	Folder,
	MovePageRequest
} from '../api/types.js';
import { getParentPath } from '../api/types.js';

interface PagesState {
	pages: Page[];
	currentPage: Page | null;
	loading: boolean;
	error: string | null;
}

interface SearchState {
	query: string;
	results: Page[];
	loading: boolean;
	error: string | null;
}

interface FoldersState {
	folders: Folder[];
	loading: boolean;
	error: string | null;
}

export const pagesStore = writable<PagesState>({
	pages: [],
	currentPage: null,
	loading: false,
	error: null
});

export const searchStore = writable<SearchState>({
	query: '',
	results: [],
	loading: false,
	error: null
});

export const foldersStore = writable<FoldersState>({
	folders: [],
	loading: false,
	error: null
});

export const pages = derived(pagesStore, ($store) => $store.pages);
export const currentPage = derived(pagesStore, ($store) => $store.currentPage);
export const isLoading = derived(pagesStore, ($store) => $store.loading);
export const error = derived(pagesStore, ($store) => $store.error);

export const searchQuery = derived(searchStore, ($store) => $store.query);
export const searchResults = derived(searchStore, ($store) => $store.results);
export const isSearching = derived(searchStore, ($store) => $store.loading);

export const folders = derived(foldersStore, ($store) => $store.folders);
export const isFoldersLoading = derived(foldersStore, ($store) => $store.loading);
export const foldersError = derived(foldersStore, ($store) => $store.error);

export const currentFolder = writable<string>('/');

export const currentFolderPages = derived(
	[pagesStore, currentFolder],
	([$pagesStore, $currentFolder]) => {
		if (!$currentFolder || $currentFolder === '/') {
			return $pagesStore.pages.filter(
				(page) =>
					!page.metaData.path || page.metaData.path === '/' || !page.metaData.path.includes('/', 1) // No additional slashes after the first
			);
		}

		return $pagesStore.pages.filter(
			(page) =>
				page.metaData.path &&
				page.metaData.path.startsWith($currentFolder) &&
				page.metaData.path !== $currentFolder
		);
	}
);

export const pageActions = {
	async loadPages() {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const pages = (await apiClient.getPages()) ?? [];
			pagesStore.update((state) => ({
				...state,
				pages,
				loading: false
			}));
		} catch (error) {
			pagesStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load pages'
			}));
		}
	},

	async loadPage(identifier: string) {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			let page: Page;

			if (identifier.startsWith('/')) {
				page = await apiClient.getPageByPath(identifier);
				currentFolder.set(getParentPath(page.metaData.path));
			} else {
				page = await apiClient.getPage(identifier);
				if (page.metaData.path) {
					currentFolder.set(getParentPath(page.metaData.path));
				}
			}

			pagesStore.update((state) => ({
				...state,
				currentPage: page,
				loading: false
			}));
			return page;
		} catch (error) {
			pagesStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load page',
				currentPage: null
			}));
			throw error;
		}
	},

	async createPage(pageData: CreatePageRequest) {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const response = await apiClient.createPage(pageData);
			const newPage = await apiClient.getPageByPath(response.path);

			pagesStore.update((state) => ({
				...state,
				pages: [...state.pages, newPage],
				currentPage: newPage,
				loading: false
			}));

			if (!newPage.metaData?.path) {
				currentFolder.set(getParentPath(newPage.metaData.path));
			}

			if (pageData.metaData.path) {
				folderActions.loadFolderTree().catch(console.error);
			}

			return newPage;
		} catch (error) {
			pagesStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to create page'
			}));
			throw error;
		}
	},

	async updatePage(slug: string, pageData: UpdatePageRequest) {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const updatedPage = await apiClient.updatePage(slug, pageData);
			pagesStore.update((state) => ({
				...state,
				pages: state.pages.map((p) => (p.metaData.slug === slug ? updatedPage : p)),
				currentPage: state.currentPage?.metaData.slug === slug ? updatedPage : state.currentPage,
				loading: false
			}));
			return updatedPage;
		} catch (error) {
			pagesStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to update page'
			}));
			throw error;
		}
	},

	async deletePage(path: string) {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			await apiClient.deletePageByPath(path);
			pagesStore.update((state) => ({
				...state,
				pages: state.pages.filter((p) => p.metaData.path !== path),
				currentPage: state.currentPage?.metaData.path === path ? null : state.currentPage,
				loading: false
			}));

			folderActions.loadFolderTree().catch(console.error);
			pageActions.loadPages().catch(console.error);
		} catch (error) {
			pagesStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to delete page'
			}));
			throw error;
		}
	},

	async loadPageByPath(path: string) {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const page = await apiClient.getPageByPath(path);
			pagesStore.update((state) => ({
				...state,
				currentPage: page,
				loading: false
			}));

			currentFolder.set(getParentPath(page.metaData.path));

			return page;
		} catch (error) {
			pagesStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load page',
				currentPage: null
			}));
			throw error;
		}
	},

	async updatePageByPath(path: string, pageData: UpdatePageRequest) {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const updatedPage = await apiClient.updatePageByPath(path, pageData);
			pagesStore.update((state) => ({
				...state,
				pages: state.pages.map((p) => (p.metaData.path === path ? updatedPage : p)),
				currentPage: state.currentPage?.metaData.path === path ? updatedPage : state.currentPage,
				loading: false
			}));
			return updatedPage;
		} catch (error) {
			pagesStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to update page'
			}));
			throw error;
		}
	},

	async deletePageByPath(path: string) {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			await apiClient.deletePageByPath(path);
			pagesStore.update((state) => ({
				...state,
				pages: state.pages.filter((p) => p.metaData.path !== path),
				currentPage: state.currentPage?.metaData.path === path ? null : state.currentPage,
				loading: false
			}));

			folderActions.loadFolderTree().catch(console.error);
		} catch (error) {
			pagesStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to delete page'
			}));
			throw error;
		}
	},

	async movePagePath(oldPath: string, newPath: string) {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const moveRequest: MovePageRequest = { oldPath, newPath };
			const result = await apiClient.movePage(moveRequest);

			await Promise.all([pageActions.loadPages(), folderActions.loadFolderTree()]);

			currentFolder.set(getParentPath(newPath));

			pagesStore.update((state) => ({ ...state, loading: false }));
			return result;
		} catch (error) {
			pagesStore.update((state) => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to move page'
			}));
			throw error;
		}
	},

	clearCurrentPage() {
		pagesStore.update((state) => ({ ...state, currentPage: null }));
	},

	clearError() {
		pagesStore.update((state) => ({ ...state, error: null }));
	}
};

export const searchActions = {
	async search(query: string) {
		searchStore.update((state) => ({
			...state,
			query,
			loading: true,
			error: null
		}));

		try {
			const results = await apiClient.searchPages(query);
			searchStore.update((state) => ({
				...state,
				results: results.pages,
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
			results: [],
			error: null
		}));
	},

	setQuery(query: string) {
		searchStore.update((state) => ({ ...state, query }));
	},

	async searchInFolder(query: string, folderPath: string) {
		searchStore.update((state) => ({
			...state,
			query,
			loading: true,
			error: null
		}));

		try {
			const allResults = await apiClient.searchPages(query);
			// Filter results to only include pages in the specified folder
			const results = allResults.pages.filter(
				(page) => page.metaData.path && page.metaData.path.startsWith(folderPath)
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
	// Load folder tree
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

	async deleteFolder(path: string) {
		foldersStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const result = await apiClient.deleteFolder(path);

			await Promise.all([folderActions.loadFolderTree(), pageActions.loadPages()]);

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

	clearError() {
		foldersStore.update((state) => ({ ...state, error: null }));
	}
};

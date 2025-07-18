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

// Store state interfaces
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

// Create stores
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

// Derived stores for convenience
export const pages = derived(pagesStore, ($store) => $store.pages);
export const currentPage = derived(pagesStore, ($store) => $store.currentPage);
export const isLoading = derived(pagesStore, ($store) => $store.loading);
export const error = derived(pagesStore, ($store) => $store.error);

export const searchQuery = derived(searchStore, ($store) => $store.query);
export const searchResults = derived(searchStore, ($store) => $store.results);
export const isSearching = derived(searchStore, ($store) => $store.loading);

// Folder derived stores
export const folders = derived(foldersStore, ($store) => $store.folders);
export const isFoldersLoading = derived(foldersStore, ($store) => $store.loading);
export const foldersError = derived(foldersStore, ($store) => $store.error);

// Current folder store - can be set manually or derived from current page
export const currentFolder = writable<string>('/');

// Derived store for pages in current folder
export const currentFolderPages = derived(
	[pagesStore, currentFolder],
	([$pagesStore, $currentFolder]) => {
		if (!$currentFolder || $currentFolder === '/') {
			// Root folder - return pages at root level (no path or path is root)
			return $pagesStore.pages.filter(
				(page) =>
					!page.metaData.path || page.metaData.path === '/' || !page.metaData.path.includes('/', 1) // No additional slashes after the first
			);
		}

		// Return pages in the specific folder
		return $pagesStore.pages.filter(
			(page) =>
				page.metaData.path &&
				page.metaData.path.startsWith($currentFolder) &&
				page.metaData.path !== $currentFolder // Don't include the folder itself
		);
	}
);

// Actions
export const pageActions = {
	// Load all pages
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

	// Load a specific page (by slug or path)
	async loadPage(identifier: string) {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			let page: Page;

			// Detect if identifier is a path (starts with '/') or a slug
			if (identifier.startsWith('/')) {
				// It's a path, use path-based API
				page = await apiClient.getPageByPath(identifier);
				// Update current folder based on page path
				currentFolder.set(getParentPath(page.metaData.path));
			} else {
				// It's a slug, use slug-based API
				page = await apiClient.getPage(identifier);
				// Update current folder based on page path if available
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

	// Create a new page
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

			// Update current folder based on the new page's path
			if (!newPage.metaData?.path) {
				currentFolder.set(getParentPath(newPage.metaData.path));
			}

			// Refresh folder tree if path is set (new folders might have been created)
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

	// Update an existing page
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

	// Delete a page
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

			// Refresh folder tree in case empty folders were removed
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

	// Load a page by path
	async loadPageByPath(path: string) {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const page = await apiClient.getPageByPath(path);
			pagesStore.update((state) => ({
				...state,
				currentPage: page,
				loading: false
			}));

			// Update current folder based on page path
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

	// Update a page by path
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

	// Delete a page by path
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

			// Refresh folder tree in case empty folders were removed
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

	// Move a page to a new path
	async movePagePath(oldPath: string, newPath: string) {
		pagesStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const moveRequest: MovePageRequest = { oldPath, newPath };
			const result = await apiClient.movePage(moveRequest);

			// Reload both pages and folder tree to reflect changes
			await Promise.all([pageActions.loadPages(), folderActions.loadFolderTree()]);

			// Update current folder to the new page location
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

	// Clear current page
	clearCurrentPage() {
		pagesStore.update((state) => ({ ...state, currentPage: null }));
	},

	// Clear error
	clearError() {
		pagesStore.update((state) => ({ ...state, error: null }));
	}
};

export const searchActions = {
	// Search pages
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
	},

	// Clear search
	clearSearch() {
		searchStore.update((state) => ({
			...state,
			query: '',
			results: [],
			error: null
		}));
	},

	// Set query without searching
	setQuery(query: string) {
		searchStore.update((state) => ({ ...state, query }));
	},

	// Search pages in a specific folder
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
			const results = allResults.filter(
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

	// Create a new folder
	async createFolder(path: string) {
		foldersStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const result = await apiClient.createFolder(path);

			// Reload folder tree to reflect changes
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

	// Delete a folder
	async deleteFolder(path: string) {
		foldersStore.update((state) => ({ ...state, loading: true, error: null }));

		try {
			const result = await apiClient.deleteFolder(path);

			// Reload both folder tree and pages to reflect changes
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

	// Clear folder error
	clearError() {
		foldersStore.update((state) => ({ ...state, error: null }));
	}
};

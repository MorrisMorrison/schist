import { writable, derived, get } from 'svelte/store';
import { apiClient } from '../api/client.js';
import type { Page, CreatePageRequest, UpdatePageRequest } from '../api/types.js';

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

// Create stores
export const pagesStore = writable<PagesState>({
  pages: [],
  currentPage: null,
  loading: false,
  error: null,
});

export const searchStore = writable<SearchState>({
  query: '',
  results: [],
  loading: false,
  error: null,
});

// Derived stores for convenience
export const pages = derived(pagesStore, ($store) => $store.pages);
export const currentPage = derived(pagesStore, ($store) => $store.currentPage);
export const isLoading = derived(pagesStore, ($store) => $store.loading);
export const error = derived(pagesStore, ($store) => $store.error);

export const searchQuery = derived(searchStore, ($store) => $store.query);
export const searchResults = derived(searchStore, ($store) => $store.results);
export const isSearching = derived(searchStore, ($store) => $store.loading);

// Actions
export const pageActions = {
  // Load all pages
  async loadPages() {
    pagesStore.update(state => ({ ...state, loading: true, error: null }));
    
    try {
      const pages = await apiClient.getPages();
      pagesStore.update(state => ({
        ...state,
        pages,
        loading: false,
      }));
    } catch (error) {
      pagesStore.update(state => ({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load pages',
      }));
    }
  },

  // Load a specific page
  async loadPage(slug: string) {
    pagesStore.update(state => ({ ...state, loading: true, error: null }));
    
    try {
      const page = await apiClient.getPage(slug);
      pagesStore.update(state => ({
        ...state,
        currentPage: page,
        loading: false,
      }));
      return page;
    } catch (error) {
      pagesStore.update(state => ({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load page',
        currentPage: null,
      }));
      throw error;
    }
  },

  // Create a new page
  async createPage(pageData: CreatePageRequest) {
    pagesStore.update(state => ({ ...state, loading: true, error: null }));
    
    try {
      const newPage = await apiClient.createPage(pageData);
      pagesStore.update(state => ({
        ...state,
        pages: [...state.pages, newPage],
        currentPage: newPage,
        loading: false,
      }));
      return newPage;
    } catch (error) {
      pagesStore.update(state => ({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to create page',
      }));
      throw error;
    }
  },

  // Update an existing page
  async updatePage(slug: string, pageData: UpdatePageRequest) {
    pagesStore.update(state => ({ ...state, loading: true, error: null }));
    
    try {
      const updatedPage = await apiClient.updatePage(slug, pageData);
      pagesStore.update(state => ({
        ...state,
        pages: state.pages.map(p => 
          p.metaData.slug === slug ? updatedPage : p
        ),
        currentPage: state.currentPage?.metaData.slug === slug ? updatedPage : state.currentPage,
        loading: false,
      }));
      return updatedPage;
    } catch (error) {
      pagesStore.update(state => ({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to update page',
      }));
      throw error;
    }
  },

  // Delete a page
  async deletePage(slug: string) {
    pagesStore.update(state => ({ ...state, loading: true, error: null }));
    
    try {
      await apiClient.deletePage(slug);
      pagesStore.update(state => ({
        ...state,
        pages: state.pages.filter(p => p.metaData.slug !== slug),
        currentPage: state.currentPage?.metaData.slug === slug ? null : state.currentPage,
        loading: false,
      }));
    } catch (error) {
      pagesStore.update(state => ({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to delete page',
      }));
      throw error;
    }
  },

  // Clear current page
  clearCurrentPage() {
    pagesStore.update(state => ({ ...state, currentPage: null }));
  },

  // Clear error
  clearError() {
    pagesStore.update(state => ({ ...state, error: null }));
  },
};

export const searchActions = {
  // Search pages
  async search(query: string) {
    searchStore.update(state => ({ 
      ...state, 
      query, 
      loading: true, 
      error: null 
    }));
    
    try {
      const results = await apiClient.searchPages(query);
      searchStore.update(state => ({
        ...state,
        results,
        loading: false,
      }));
      return results;
    } catch (error) {
      searchStore.update(state => ({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : 'Search failed',
        results: [],
      }));
      throw error;
    }
  },

  // Clear search
  clearSearch() {
    searchStore.update(state => ({
      ...state,
      query: '',
      results: [],
      error: null,
    }));
  },

  // Set query without searching
  setQuery(query: string) {
    searchStore.update(state => ({ ...state, query }));
  },
};
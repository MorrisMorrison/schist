import { writable, derived } from 'svelte/store';
import { apiClient } from '$lib/api/client';
import type { TagInfo } from '$lib/api/types';
import { documentsStore } from './documents';

export interface TagsState {
	tags: TagInfo[];
	loading: boolean;
	error: string | null;
	loaded: boolean;
	activeFilters: string[];
}

const initialState: TagsState = {
	tags: [],
	loading: false,
	error: null,
	loaded: false,
	activeFilters: []
};

export const tagsStore = writable<TagsState>(initialState);

// Derived store for filtered documents based on active tag filters
export const filteredDocumentsByTags = derived(
	[tagsStore, documentsStore],
	([tagsState, docsState]) => {
		if (tagsState.activeFilters.length === 0) {
			return docsState.documents;
		}

		return docsState.documents.filter((doc) => {
			const docTags = doc.metaData?.tags || [];
			// Document must have ALL active filter tags (AND logic)
			return tagsState.activeFilters.every((filterTag) =>
				docTags.some((docTag) => docTag.toLowerCase() === filterTag.toLowerCase())
			);
		});
	}
);

// Derived store for tag suggestions (sorted by frequency)
export const tagSuggestions = derived(tagsStore, (state) => {
	return state.tags
		.map((tag) => tag.name)
		.sort((a, b) => {
			// Sort by frequency (count) descending
			const tagA = state.tags.find((t) => t.name === a);
			const tagB = state.tags.find((t) => t.name === b);
			return (tagB?.count || 0) - (tagA?.count || 0);
		});
});

export const tagActions = {
	async loadTags(force: boolean = false): Promise<void> {
		const store = tagsStore;

		// Get current state
		let currentState: TagsState;
		const unsubscribe = store.subscribe((state) => (currentState = state));
		unsubscribe();

		// Don't reload if already loaded unless forced
		if (currentState!.loaded && !force) {
			return;
		}

		// Don't make multiple concurrent requests
		if (currentState!.loading) {
			return;
		}

		store.update((state) => ({
			...state,
			loading: true,
			error: null
		}));

		try {
			const tags = await apiClient.getTags();

			store.update((state) => ({
				...state,
				tags,
				loading: false,
				loaded: true,
				error: null
			}));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to load tags';
			console.error('Failed to load tags:', error);

			store.update((state) => ({
				...state,
				tags: [],
				loading: false,
				loaded: false,
				error: errorMessage
			}));
		}
	},

	clearTags(): void {
		tagsStore.set(initialState);
	},

	// Tag filtering functions
	addTagFilter(tagName: string): void {
		tagsStore.update((state) => ({
			...state,
			activeFilters: [...new Set([...state.activeFilters, tagName])]
		}));
	},

	removeTagFilter(tagName: string): void {
		tagsStore.update((state) => ({
			...state,
			activeFilters: state.activeFilters.filter((tag) => tag !== tagName)
		}));
	},

	clearTagFilters(): void {
		tagsStore.update((state) => ({
			...state,
			activeFilters: []
		}));
	},

	toggleTagFilter(tagName: string): void {
		let isActive = false;
		const unsubscribe = tagsStore.subscribe((state) => {
			isActive = state.activeFilters.includes(tagName);
		});
		unsubscribe();

		if (isActive) {
			this.removeTagFilter(tagName);
		} else {
			this.addTagFilter(tagName);
		}
	},

	// Helper functions
	getTagByName(name: string): TagInfo | null {
		let tag: TagInfo | null = null;
		const unsubscribe = tagsStore.subscribe((state) => {
			tag = state.tags.find((t) => t.name === name) || null;
		});
		unsubscribe();
		return tag;
	},

	// Search tags by partial name match
	searchTags(query: string): TagInfo[] {
		if (!query.trim()) return [];

		let matchingTags: TagInfo[] = [];
		const unsubscribe = tagsStore.subscribe((state) => {
			const lowerQuery = query.toLowerCase();
			matchingTags = state.tags
				.filter((tag) => tag.name.toLowerCase().includes(lowerQuery))
				.sort((a, b) => {
					// Prioritize exact matches, then by frequency
					const aExact = a.name.toLowerCase() === lowerQuery;
					const bExact = b.name.toLowerCase() === lowerQuery;

					if (aExact && !bExact) return -1;
					if (!aExact && bExact) return 1;

					return b.count - a.count;
				});
		});
		unsubscribe();
		return matchingTags;
	}
};

import { writable } from 'svelte/store';
import { apiClient } from '$lib/api/client';
import type { Template } from '$lib/api/types';

export interface TemplatesState {
	templates: Template[];
	loading: boolean;
	error: string | null;
	loaded: boolean;
}

const initialState: TemplatesState = {
	templates: [],
	loading: false,
	error: null,
	loaded: false
};

export const templatesStore = writable<TemplatesState>(initialState);

export const templateActions = {
	async loadTemplates(force: boolean = false): Promise<void> {
		const store = templatesStore;

		// Get current state
		let currentState: TemplatesState;
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
			const templates = await apiClient.getTemplates();

			store.update((state) => ({
				...state,
				templates,
				loading: false,
				loaded: true,
				error: null
			}));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to load templates';
			console.error('Failed to load templates:', error);

			store.update((state) => ({
				...state,
				templates: [],
				loading: false,
				loaded: false,
				error: errorMessage
			}));
		}
	},

	clearTemplates(): void {
		templatesStore.set(initialState);
	},

	// Helper to get a template by ID
	getTemplateById(id: string): Template | null {
		let template: Template | null = null;
		const unsubscribe = templatesStore.subscribe((state) => {
			template = state.templates.find((t) => t.id === id) || null;
		});
		unsubscribe();
		return template;
	},

	// Helper to get templates by category
	getTemplatesByCategory(category: string): Template[] {
		let templates: Template[] = [];
		const unsubscribe = templatesStore.subscribe((state) => {
			templates = state.templates.filter((t) => t.category === category);
		});
		unsubscribe();
		return templates;
	}
};

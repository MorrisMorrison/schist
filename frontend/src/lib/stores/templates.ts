import { writable, get } from 'svelte/store';
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
		templatesStore.update((state) => ({
			...state,
			loading: true,
			error: null
		}));

		try {
			const templates = await apiClient.getTemplates(force);

			templatesStore.update((state) => ({
				...state,
				templates,
				loading: false,
				loaded: true,
				error: null
			}));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to load templates';
			console.error('Failed to load templates:', error);

			templatesStore.update((state) => ({
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

	getTemplateById(id: string): Template | null {
		let template: Template | null = null;
		const unsubscribe = templatesStore.subscribe((state) => {
			template = state.templates.find((t) => t.id === id) || null;
		});
		unsubscribe();
		return template;
	},

	getTemplatesByCategory(category: string): Template[] {
		let templates: Template[] = [];
		const unsubscribe = templatesStore.subscribe((state) => {
			templates = state.templates.filter((t) => t.category === category);
		});
		unsubscribe();
		return templates;
	}
};

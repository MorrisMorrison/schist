import { browser } from '$app/environment';
import { apiClient } from '$lib/api/client';
import type { Template } from '$lib/api/types';

export interface TemplatesState {
	templates: Template[];
	loading: boolean;
	error: string | null;
	loaded: boolean;
}

const defaultTemplatesState: TemplatesState = {
	templates: [],
	loading: false,
	error: null,
	loaded: false
};

let templatesState: TemplatesState = defaultTemplatesState;

if (browser) {
	templatesState = $state<TemplatesState>(defaultTemplatesState);
}

function createTemplatesStore() {
	return {
		async loadTemplates(force: boolean = false): Promise<void> {
			if (!force && (templatesState.loaded || templatesState.loading)) {
				return;
			}

			if (browser) {
				templatesState.loading = true;
				templatesState.error = null;
			}

			try {
				const templates = await apiClient.getTemplates(force);

				if (browser) {
					templatesState.templates = templates;
					templatesState.loading = false;
					templatesState.loaded = true;
					templatesState.error = null;
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Failed to load templates';
				console.error('Failed to load templates:', error);

				if (browser) {
					templatesState.templates = [];
					templatesState.loading = false;
					templatesState.loaded = false;
					templatesState.error = errorMessage;
				}
			}
		},

		clearTemplates(): void {
			if (browser) {
				Object.assign(templatesState, defaultTemplatesState);
			}
		},

		getTemplateById(id: string): Template | null {
			return templatesState.templates.find((t) => t.id === id) || null;
		},

		getTemplatesByCategory(category: string): Template[] {
			return templatesState.templates.filter((t) => t.category === category);
		}
	};
}

export const templatesStore = {
	get templates() {
		return templatesState.templates;
	},
	get loading() {
		return templatesState.loading;
	},
	get error() {
		return templatesState.error;
	},
	get loaded() {
		return templatesState.loaded;
	},

	// Action methods
	...createTemplatesStore()
};

export const templateActions = {
	...createTemplatesStore()
};

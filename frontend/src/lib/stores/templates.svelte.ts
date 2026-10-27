import { apiClient } from '#lib/api/client.ts';
import type { Template } from '#lib/api/types.ts';
import { getErrorMessage } from '#lib/utils/error.ts';

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

const templatesState: TemplatesState = $state<TemplatesState>(defaultTemplatesState);

function createTemplatesStore() {
	return {
		async loadTemplates(force: boolean = false): Promise<void> {
			if (!force && (templatesState.loaded || templatesState.loading)) {
				return;
			}

			templatesState.loading = true;
			templatesState.error = null;

			try {
				const templates = await apiClient.getTemplates(force);

				templatesState.templates = templates;
				templatesState.loading = false;
				templatesState.loaded = true;
				templatesState.error = null;
			} catch (error) {
				const errorMessage = getErrorMessage(error, 'Failed to load templates');
				console.error('Failed to load templates:', error);

				templatesState.templates = [];
				templatesState.loading = false;
				templatesState.loaded = false;
				templatesState.error = errorMessage;
			}
		},

		clearTemplates(): void {
			Object.assign(templatesState, defaultTemplatesState);
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

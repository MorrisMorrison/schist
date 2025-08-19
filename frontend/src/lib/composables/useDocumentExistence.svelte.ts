import { documentActions } from '$lib/stores/documents.svelte';

export interface DocumentExistenceState {
	exists: boolean;
	warning: string;
	isChecking: boolean;
}

export function useDocumentExistence(debounceMs = 500) {
	let exists = $state(false);
	let warning = $state('');
	let isChecking = $state(false);
	let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

	function checkExistence(path: string, currentPath?: string) {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}

		warning = '';
		exists = false;

		if (!path.trim() || (currentPath && path === currentPath)) {
			return;
		}

		isChecking = true;

		debounceTimeout = setTimeout(async () => {
			try {
				const documentExists = await documentActions.checkDocumentExists(path);
				exists = documentExists;

				if (documentExists) {
					warning = `A document already exists at "${path}". Please choose a different title.`;
				} else {
					warning = '';
				}
			} catch (error) {
				console.debug('Document existence check failed:', error);
				exists = false;
				warning = '';
			} finally {
				isChecking = false;
			}
		}, debounceMs);
	}

	function reset() {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}
		exists = false;
		warning = '';
		isChecking = false;
	}

	function cleanup() {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
			debounceTimeout = null;
		}
	}

	return {
		get state(): DocumentExistenceState {
			return { exists, warning, isChecking };
		},
		get exists() {
			return exists;
		},
		get warning() {
			return warning;
		},
		get isChecking() {
			return isChecking;
		},
		checkExistence,
		reset,
		cleanup
	};
}

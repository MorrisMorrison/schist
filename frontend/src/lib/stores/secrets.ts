import { writable, derived } from 'svelte/store';
import { apiClient } from '$lib/api/client';
import type { SecretsStatus, CreateSecretRequest, UpdateSecretRequest } from '$lib/api/types';

export interface SecretInfo {
	key: string;
	hasValue: boolean; // We don't store actual values in the store for security
}

export interface SecretStoreState {
	status: SecretsStatus | null;
	secrets: SecretInfo[];
	loading: boolean;
	error: string | null;
	unlocking: boolean;
}

const initialState: SecretStoreState = {
	status: null,
	secrets: [],
	loading: false,
	error: null,
	unlocking: false
};

function createSecretStore() {
	const { subscribe, set, update } = writable<SecretStoreState>(initialState);

	return {
		subscribe,

		// Load secrets status from server
		async loadStatus(): Promise<SecretsStatus> {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				const status = await apiClient.getSecretsStatus();

				update((state) => ({ ...state, status, loading: false }));
				return status;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to load secrets status';
				update((state) => ({ ...state, error: errorMsg, loading: false }));
				throw error;
			}
		},

		// Load list of secret keys (not values for security)
		async loadSecrets(): Promise<SecretInfo[]> {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				const response = await apiClient.listSecrets();
				const secrets = response.secrets.map((key) => ({
					key,
					hasValue: true
				}));

				update((state) => ({ ...state, secrets, loading: false }));
				return secrets;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to load secrets';
				update((state) => ({ ...state, error: errorMsg, loading: false }));
				throw error;
			}
		},

		// Password-based unlock removed - secrets are unlocked via passkey authentication

		// Lock secrets
		async lock(): Promise<void> {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				await apiClient.lockSecrets();

				// Clear sensitive data and reload status
				await this.loadStatus();
				update((state) => ({ ...state, secrets: [], loading: false }));
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to lock secrets';
				update((state) => ({ ...state, error: errorMsg, loading: false }));
				throw error;
			}
		},

		// Create a new secret
		async createSecret(request: CreateSecretRequest): Promise<void> {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				await apiClient.createSecret(request);

				// Reload secrets and status
				await this.loadSecrets();
				await this.loadStatus();

				update((state) => ({ ...state, loading: false }));
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to create secret';
				update((state) => ({ ...state, error: errorMsg, loading: false }));
				throw error;
			}
		},

		// Get a secret value (returns promise to avoid storing in state)
		async getSecret(key: string): Promise<string> {
			const response = await apiClient.getSecret(key);
			return response.value;
		},

		// Update a secret
		async updateSecret(key: string, request: UpdateSecretRequest): Promise<void> {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				await apiClient.updateSecret(key, request);

				// Reload secrets after update
				await this.loadSecrets();
				update((state) => ({ ...state, loading: false }));
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to update secret';
				update((state) => ({ ...state, error: errorMsg, loading: false }));
				throw error;
			}
		},

		// Delete a secret
		async deleteSecret(key: string): Promise<void> {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				await apiClient.deleteSecret(key);

				// Reload secrets and status after deletion
				await this.loadSecrets();
				await this.loadStatus();

				update((state) => ({ ...state, loading: false }));
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to delete secret';
				update((state) => ({ ...state, error: errorMsg, loading: false }));
				throw error;
			}
		},

		// Clear error state
		clearError() {
			update((state) => ({ ...state, error: null }));
		},

		// Reset store to initial state
		reset() {
			set(initialState);
		}
	};
}

export const secretStore = createSecretStore();

// Derived stores for convenience
export const secretsUnlocked = derived(secretStore, ($store) => $store.status?.unlocked ?? false);

export const hasSecrets = derived(secretStore, ($store) => $store.status?.has_secrets ?? false);

export const requiresPassword = derived(
	secretStore,
	($store) => $store.status?.requires_password ?? false
);

export const secretList = derived(secretStore, ($store) => $store.secrets);

export const secretsLoading = derived(secretStore, ($store) => $store.loading);

export const secretsError = derived(secretStore, ($store) => $store.error);

export const secretsUnlocking = derived(secretStore, ($store) => $store.unlocking);

export const hasPasskeys = derived(secretStore, ($store) => $store.status?.has_passkeys ?? false);

export const requiresSetup = derived(
	secretStore,
	($store) => $store.status?.requires_setup ?? false
);

// Helper function to process secret placeholders in text
export function parseSecretPlaceholders(text: string): { placeholder: string; key: string }[] {
	const placeholderRegex = /\{\{secret:([^}]+)\}\}/g;
	const placeholders: { placeholder: string; key: string }[] = [];
	let match;

	while ((match = placeholderRegex.exec(text)) !== null) {
		placeholders.push({
			placeholder: match[0],
			key: match[1].trim()
		});
	}

	return placeholders;
}

// Helper function to replace secret placeholders with actual values
export async function replaceSecretPlaceholders(
	text: string,
	getSecretValue: (key: string) => Promise<string>
): Promise<string> {
	const placeholders = parseSecretPlaceholders(text);

	let processedText = text;
	for (const { placeholder, key } of placeholders) {
		try {
			const value = await getSecretValue(key);
			processedText = processedText.replace(placeholder, value);
		} catch (error) {
			// Keep placeholder if secret not found or error occurred
			console.warn(`Failed to replace secret placeholder ${placeholder}:`, error);
		}
	}

	return processedText;
}

// Helper function to add visual indicators for locked secret placeholders
export function addSecretPlaceholderIndicators(text: string, isUnlocked: boolean): string {
	if (isUnlocked) {
		return text; // Don't add indicators if unlocked (secrets will be replaced)
	}

	const placeholders = parseSecretPlaceholders(text);

	let processedText = text;
	for (const { placeholder, key } of placeholders) {
		const indicator = `<span class="secret-placeholder bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-1 rounded-md font-mono text-sm border border-amber-200 dark:border-amber-700" title="Secret '${key}' is locked. Unlock secrets to view the value.">${placeholder} 🔒</span>`;
		processedText = processedText.replace(placeholder, indicator);
	}

	return processedText;
}

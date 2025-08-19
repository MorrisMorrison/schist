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

const defaultSecretState: SecretStoreState = {
	status: null,
	secrets: [],
	loading: false,
	error: null,
	unlocking: false
};

const secretState: SecretStoreState = $state<SecretStoreState>(defaultSecretState);

function createSecretStore() {
	return {
		async loadStatus(): Promise<SecretsStatus> {
			secretState.loading = true;
			secretState.error = null;

			try {
				const status = await apiClient.getSecretsStatus();

				secretState.status = status;
				secretState.loading = false;
				return status;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to load secrets status';
				secretState.error = errorMsg;
				secretState.loading = false;
				throw error;
			}
		},

		async loadSecrets(): Promise<SecretInfo[]> {
			secretState.loading = true;
			secretState.error = null;

			try {
				const response = await apiClient.listSecrets();
				const secrets = response.secrets.map((key) => ({
					key,
					hasValue: true
				}));

				secretState.secrets = secrets;
				secretState.loading = false;
				return secrets;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to load secrets';
				secretState.error = errorMsg;
				secretState.loading = false;
				throw error;
			}
		},

		async lock(): Promise<void> {
			secretState.loading = true;
			secretState.error = null;

			try {
				await apiClient.lockSecrets();

				// Clear sensitive data and reload status
				await this.loadStatus();
				secretState.secrets = [];
				secretState.loading = false;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to lock secrets';
				secretState.error = errorMsg;
				secretState.loading = false;
				throw error;
			}
		},

		async createSecret(request: CreateSecretRequest): Promise<void> {
			secretState.loading = true;
			secretState.error = null;

			try {
				await apiClient.createSecret(request);

				await this.loadSecrets();
				await this.loadStatus();

				secretState.loading = false;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to create secret';
				secretState.error = errorMsg;
				secretState.loading = false;
				throw error;
			}
		},

		async getSecret(key: string): Promise<string> {
			const response = await apiClient.getSecret(key);
			return response.value;
		},

		async updateSecret(key: string, request: UpdateSecretRequest): Promise<void> {
			secretState.loading = true;
			secretState.error = null;

			try {
				await apiClient.updateSecret(key, request);

				// Reload secrets after update
				await this.loadSecrets();
				secretState.loading = false;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to update secret';
				secretState.error = errorMsg;
				secretState.loading = false;
				throw error;
			}
		},

		async deleteSecret(key: string): Promise<void> {
			secretState.loading = true;
			secretState.error = null;

			try {
				await apiClient.deleteSecret(key);

				// Reload secrets and status after deletion
				await this.loadSecrets();
				await this.loadStatus();

				secretState.loading = false;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to delete secret';
				secretState.error = errorMsg;
				secretState.loading = false;
				throw error;
			}
		},

		clearError() {
			secretState.error = null;
		},

		reset() {
			Object.assign(secretState, defaultSecretState);
		}
	};
}

export const secretStore = {
	get status() {
		return secretState.status;
	},
	get secrets() {
		return secretState.secrets;
	},
	get loading() {
		return secretState.loading;
	},
	get error() {
		return secretState.error;
	},
	get unlocking() {
		return secretState.unlocking;
	},

	// Derived getters
	get secretsUnlocked() {
		return secretState.status?.unlocked ?? false;
	},
	get hasSecrets() {
		return secretState.status?.has_secrets ?? false;
	},
	get requiresPassword() {
		return secretState.status?.requires_password ?? false;
	},
	get hasPasskeys() {
		return secretState.status?.has_passkeys ?? false;
	},
	get requiresSetup() {
		return secretState.status?.requires_setup ?? false;
	},

	// Action methods
	...createSecretStore()
};

// Derived exports for convenience
export const secretsUnlocked = () => secretStore.secretsUnlocked;
export const hasSecrets = () => secretStore.hasSecrets;
export const requiresPassword = () => secretStore.requiresPassword;
export const hasPasskeys = () => secretStore.hasPasskeys;
export const requiresSetup = () => secretStore.requiresSetup;

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
			console.warn(`Failed to replace secret placeholder ${placeholder}:`, error);
		}
	}

	return processedText;
}

// Helper function to add visual indicators for locked secret placeholders
export function addSecretPlaceholderIndicators(text: string, isUnlocked: boolean): string {
	if (isUnlocked) {
		return text;
	}

	const placeholders = parseSecretPlaceholders(text);

	let processedText = text;
	for (const { placeholder, key } of placeholders) {
		const indicator = `<span class="secret-placeholder bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-1 rounded-md font-mono text-sm border border-amber-200 dark:border-amber-700" title="Secret '${key}' is locked. Unlock secrets to view the value.">${placeholder} 🔒</span>`;
		processedText = processedText.replace(placeholder, indicator);
	}

	return processedText;
}

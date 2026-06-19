import { apiClient } from '$lib/api/client';
import type { SecretsStatus, CreateSecretRequest, UpdateSecretRequest } from '$lib/api/types';
import { runAsync } from './resource.svelte';

export interface SecretInfo {
	key: string;
	hasValue: boolean; // We don't store actual values in the store for security
}

export interface SecretStoreState {
	status: SecretsStatus | null;
	secrets: SecretInfo[];
	loading: boolean;
	error: string | null;
}

const defaultSecretState: SecretStoreState = {
	status: null,
	secrets: [],
	loading: false,
	error: null
};

const secretState: SecretStoreState = $state<SecretStoreState>(defaultSecretState);

function createSecretStore() {
	return {
		async loadStatus(): Promise<SecretsStatus> {
			return runAsync(
				secretState,
				async () => {
					const status = await apiClient.getSecretsStatus();
					secretState.status = status;
					return status;
				},
				'Failed to load secrets status'
			);
		},

		async loadSecrets(): Promise<SecretInfo[]> {
			return runAsync(
				secretState,
				async () => {
					const response = await apiClient.listSecrets();
					const secrets = response.secrets.map((key) => ({
						key,
						hasValue: true
					}));

					secretState.secrets = secrets;
					return secrets;
				},
				'Failed to load secrets'
			);
		},

		async lock(): Promise<void> {
			await runAsync(
				secretState,
				async () => {
					await apiClient.lockSecrets();

					// Clear sensitive data and reload status
					await this.loadStatus();
					secretState.secrets = [];
				},
				'Failed to lock secrets'
			);
		},

		async createSecret(request: CreateSecretRequest): Promise<void> {
			await runAsync(
				secretState,
				async () => {
					await apiClient.createSecret(request);

					await this.loadSecrets();
					await this.loadStatus();
				},
				'Failed to create secret'
			);
		},

		async getSecret(key: string): Promise<string> {
			const response = await apiClient.getSecret(key);
			return response.value;
		},

		async updateSecret(key: string, request: UpdateSecretRequest): Promise<void> {
			await runAsync(
				secretState,
				async () => {
					await apiClient.updateSecret(key, request);

					// Reload secrets after update
					await this.loadSecrets();
				},
				'Failed to update secret'
			);
		},

		async deleteSecret(key: string): Promise<void> {
			await runAsync(
				secretState,
				async () => {
					await apiClient.deleteSecret(key);

					// Reload secrets and status after deletion
					await this.loadSecrets();
					await this.loadStatus();
				},
				'Failed to delete secret'
			);
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

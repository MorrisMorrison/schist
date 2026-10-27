import { apiClient } from '#lib/api/client.ts';
import type { SecretsStatus, CreateSecretRequest, UpdateSecretRequest } from '#lib/api/types.ts';
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
const SECRET_PLACEHOLDER_REGEX = /\{\{secret:([^}]+)\}\}/g;

export function parseSecretPlaceholders(text: string): { placeholder: string; key: string }[] {
	return Array.from(text.matchAll(SECRET_PLACEHOLDER_REGEX), (match) => ({
		placeholder: match[0],
		key: match[1].trim()
	}));
}

// Replaces secret placeholders with their values. Values are inserted
// literally (a function replacer, so `$&` and friends are not expanded), and
// each distinct key is fetched once. Placeholders whose value cannot be loaded
// are left as they are.
export async function replaceSecretPlaceholders(
	text: string,
	getSecretValue: (key: string) => Promise<string>
): Promise<string> {
	const values = new Map<string, string>();
	for (const { placeholder, key } of parseSecretPlaceholders(text)) {
		if (values.has(key)) continue;
		try {
			values.set(key, await getSecretValue(key));
		} catch (error) {
			console.warn(`Failed to replace secret placeholder ${placeholder}:`, error);
		}
	}

	return text.replace(SECRET_PLACEHOLDER_REGEX, (placeholder, rawKey: string) => {
		const value = values.get(rawKey.trim());
		return value === undefined ? placeholder : value;
	});
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// Wraps each secret placeholder in a "locked" indicator for display while
// secrets are locked. The key comes from the document text and may contain
// quotes or markup, so it is escaped before it is spliced into HTML.
export function markLockedSecretPlaceholders(text: string): string {
	return text.replace(SECRET_PLACEHOLDER_REGEX, (placeholder, rawKey: string) => {
		const key = escapeHtml(rawKey.trim());
		return `<span class="secret-placeholder bg-muted text-muted-foreground px-2 py-1 rounded-md font-mono text-sm border border-border" title="Secret '${key}' is locked. Unlock secrets to view the value.">${escapeHtml(placeholder)} 🔒</span>`;
	});
}

import { writable, derived } from 'svelte/store';
import { apiClient } from '$lib/api/client';
import {
	registerPasskey,
	authenticateWithPasskey as webAuthnAuthenticate,
	WebAuthnError,
	isWebAuthnSupported
} from '$lib/utils/webauthn';

export interface PasskeyInfo {
	id: string;
	name: string;
	createdAt: string;
}

export interface PasskeyStatus {
	hasPasskeys: boolean;
	isUnlocked: boolean;
	requiresPassword: boolean;
}

interface PasskeyStoreState {
	passkeys: PasskeyInfo[];
	status: PasskeyStatus | null;
	loading: boolean;
	error: string | null;
}

const initialState: PasskeyStoreState = {
	passkeys: [],
	status: null,
	loading: false,
	error: null
};

function createPasskeyStore() {
	const { subscribe, set, update } = writable<PasskeyStoreState>(initialState);

	return {
		subscribe,

		// Load passkey status from server
		async loadStatus(): Promise<PasskeyStatus> {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				const status = await apiClient.getPasskeyStatus();

				update((state) => ({ ...state, status, loading: false }));
				return status;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to load passkey status';
				update((state) => ({ ...state, error: errorMsg, loading: false }));
				throw error;
			}
		},

		// Load list of registered passkeys
		async loadPasskeys(): Promise<PasskeyInfo[]> {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				const response = await apiClient.listPasskeys();
				const passkeys = response.passkeys;

				update((state) => ({ ...state, passkeys, loading: false }));
				return passkeys;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to load passkeys';
				update((state) => ({ ...state, error: errorMsg, loading: false }));
				throw error;
			}
		},

		// Create a new passkey using WebAuthn
		async createPasskey(name: string): Promise<string> {
			if (!isWebAuthnSupported()) {
				const errorMsg =
					'WebAuthn is not supported in this browser. Please use a modern browser with passkey support.';
				update((state) => ({ ...state, error: errorMsg }));
				throw new WebAuthnError(errorMsg, 'NOT_SUPPORTED');
			}

			update((state) => ({ ...state, loading: true, error: null }));

			try {
				const credentialId = await registerPasskey(name);

				// Reload passkeys and status
				await this.loadPasskeys();
				await this.loadStatus();

				update((state) => ({ ...state, loading: false }));
				return credentialId;
			} catch (error) {
				let errorMsg = 'Failed to create passkey';

				if (error instanceof WebAuthnError) {
					switch (error.code) {
						case 'USER_CANCELLED':
							errorMsg = 'Passkey creation was cancelled. Please try again.';
							break;
						case 'CREDENTIAL_EXISTS':
							errorMsg = 'A passkey already exists for this device. Try using a different name.';
							break;
						case 'NOT_SUPPORTED':
							errorMsg = 'WebAuthn is not supported on this device.';
							break;
						case 'SECURITY_ERROR':
							errorMsg = "Security error occurred. Please ensure you're on a secure connection.";
							break;
						default:
							errorMsg = error.message;
					}
				} else if (error instanceof Error) {
					errorMsg = error.message;
				}

				update((state) => ({ ...state, error: errorMsg, loading: false }));
				throw error;
			}
		},

		// Delete a passkey
		async deletePasskey(credentialId: string): Promise<void> {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				await apiClient.deletePasskey(credentialId);

				// Reload passkeys and status
				await this.loadPasskeys();
				await this.loadStatus();

				update((state) => ({ ...state, loading: false }));
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to delete passkey';
				update((state) => ({ ...state, error: errorMsg, loading: false }));
				throw error;
			}
		},

		// Authenticate with WebAuthn and unlock secrets
		async authenticateWithPasskey(): Promise<string> {
			if (!isWebAuthnSupported()) {
				const errorMsg =
					'WebAuthn is not supported in this browser. Please use a modern browser with passkey support.';
				update((state) => ({ ...state, error: errorMsg }));
				throw new WebAuthnError(errorMsg, 'NOT_SUPPORTED');
			}

			update((state) => ({ ...state, loading: true, error: null }));

			try {
				const credentialId = await webAuthnAuthenticate();

				// Now unlock secrets with the authenticated credential
				await apiClient.unlockWithPasskey({ credentialId });

				// Update status to reflect unlocked state
				await this.loadStatus();

				update((state) => ({ ...state, loading: false }));
				return credentialId;
			} catch (error) {
				let errorMsg = 'Failed to authenticate with passkey';

				if (error instanceof WebAuthnError) {
					switch (error.code) {
						case 'USER_CANCELLED':
							errorMsg = 'Authentication was cancelled. Please try again.';
							break;
						case 'NO_CREDENTIALS':
							errorMsg = 'No matching passkeys found for this device.';
							break;
						case 'NOT_SUPPORTED':
							errorMsg = 'WebAuthn is not supported on this device.';
							break;
						case 'SECURITY_ERROR':
							errorMsg = 'Security error occurred during authentication.';
							break;
						default:
							errorMsg = error.message;
					}
				} else if (error instanceof Error) {
					errorMsg = error.message;
				}

				update((state) => ({ ...state, error: errorMsg, loading: false }));
				throw error;
			}
		},

		// Legacy method: Unlock secrets with a specific credential ID (for backwards compatibility)
		async unlockWithPasskey(credentialId: string): Promise<void> {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				await apiClient.unlockWithPasskey({ credentialId });

				// Update status to reflect unlocked state
				await this.loadStatus();

				update((state) => ({ ...state, loading: false }));
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to unlock with passkey';
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

export const passkeyStore = createPasskeyStore();

// Derived stores for convenience
export const isUnlocked = derived(passkeyStore, ($store) => $store.status?.isUnlocked ?? false);

export const hasPasskeys = derived(passkeyStore, ($store) => $store.status?.hasPasskeys ?? false);

export const requiresSetup = derived(
	passkeyStore,
	($store) => !$store.status?.hasPasskeys && !$store.status?.isUnlocked
);

export const passkeyList = derived(passkeyStore, ($store) => $store.passkeys);

export const passkeyLoading = derived(passkeyStore, ($store) => $store.loading);

export const passkeyError = derived(passkeyStore, ($store) => $store.error);

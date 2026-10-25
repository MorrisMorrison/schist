import { apiClient } from '$lib/api/client';
import {
	registerPasskey,
	authenticateWithPasskey as webAuthnAuthenticate,
	WebAuthnError,
	isWebAuthnSupported
} from '$lib/utils/webauthn';
import { runAsync } from './resource.svelte';

import type { PasskeyInfo, PasskeyStatus } from '$lib/api/types';

export type { PasskeyInfo, PasskeyStatus };

interface PasskeyStoreState {
	passkeys: PasskeyInfo[];
	status: PasskeyStatus | null;
	loading: boolean;
	error: string | null;
}

const defaultPasskeyState: PasskeyStoreState = {
	passkeys: [],
	status: null,
	loading: false,
	error: null
};

const passkeyState: PasskeyStoreState = $state<PasskeyStoreState>(defaultPasskeyState);

function createPasskeyStore() {
	return {
		async loadStatus(force = false): Promise<PasskeyStatus> {
			return runAsync(
				passkeyState,
				async () => {
					const status = await apiClient.getPasskeyStatus(force);
					passkeyState.status = status;
					return status;
				},
				'Failed to load passkey status'
			);
		},

		async loadPasskeys(force = false): Promise<PasskeyInfo[]> {
			return runAsync(
				passkeyState,
				async () => {
					const response = await apiClient.listPasskeys(force);
					const passkeys = response.passkeys;

					passkeyState.passkeys = passkeys;
					return passkeys;
				},
				'Failed to load passkeys'
			);
		},

		async createPasskey(name: string): Promise<string> {
			if (!isWebAuthnSupported()) {
				const errorMsg =
					'WebAuthn is not supported in this browser. Please use a modern browser with passkey support.';
				passkeyState.error = errorMsg;
				throw new WebAuthnError(errorMsg, 'NOT_SUPPORTED');
			}

			passkeyState.loading = true;
			passkeyState.error = null;

			try {
				const credentialId = await registerPasskey(name);

				await this.loadPasskeys();
				await this.loadStatus();

				passkeyState.loading = false;
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

				passkeyState.error = errorMsg;
				passkeyState.loading = false;
				throw error;
			}
		},

		async deletePasskey(credentialId: string): Promise<void> {
			await runAsync(
				passkeyState,
				async () => {
					await apiClient.deletePasskey(credentialId);

					await this.loadPasskeys();
					await this.loadStatus();
				},
				'Failed to delete passkey'
			);
		},

		async authenticateWithPasskey(): Promise<string> {
			if (!isWebAuthnSupported()) {
				const errorMsg =
					'WebAuthn is not supported in this browser. Please use a modern browser with passkey support.';
				passkeyState.error = errorMsg;
				throw new WebAuthnError(errorMsg, 'NOT_SUPPORTED');
			}

			passkeyState.loading = true;
			passkeyState.error = null;

			try {
				const { credentialId, authTicket } = await webAuthnAuthenticate();

				await apiClient.unlockWithPasskey({ authTicket });

				await this.loadStatus();

				passkeyState.loading = false;
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

				passkeyState.error = errorMsg;
				passkeyState.loading = false;
				throw error;
			}
		},

		// Clear error state
		clearError() {
			passkeyState.error = null;
		},

		// Reset store to initial state
		reset() {
			Object.assign(passkeyState, defaultPasskeyState);
		}
	};
}

export const passkeyStore = {
	get passkeys() {
		return passkeyState.passkeys;
	},
	get status() {
		return passkeyState.status;
	},
	get loading() {
		return passkeyState.loading;
	},
	get error() {
		return passkeyState.error;
	},

	// Derived getters
	get isUnlocked() {
		return passkeyState.status?.isUnlocked ?? false;
	},
	get hasPasskeys() {
		return passkeyState.status?.hasPasskeys ?? false;
	},
	get requiresSetup() {
		return !passkeyState.status?.hasPasskeys && !passkeyState.status?.isUnlocked;
	},

	// Action methods
	...createPasskeyStore()
};

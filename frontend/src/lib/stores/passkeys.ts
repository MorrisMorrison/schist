import { browser } from '$app/environment';
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

const defaultPasskeyState: PasskeyStoreState = {
	passkeys: [],
	status: null,
	loading: false,
	error: null
};

let passkeyState: PasskeyStoreState = defaultPasskeyState;

if (browser) {
	passkeyState = $state<PasskeyStoreState>(defaultPasskeyState);
}

function createPasskeyStore() {
	return {
		async loadStatus(force = false): Promise<PasskeyStatus> {
			if (browser) {
				passkeyState.loading = true;
				passkeyState.error = null;
			}

			try {
				const status = await apiClient.getPasskeyStatus(force);

				if (browser) {
					passkeyState.status = status;
					passkeyState.loading = false;
				}
				return status;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to load passkey status';
				if (browser) {
					passkeyState.error = errorMsg;
					passkeyState.loading = false;
				}
				throw error;
			}
		},

		async loadPasskeys(force = false): Promise<PasskeyInfo[]> {
			if (browser) {
				passkeyState.loading = true;
				passkeyState.error = null;
			}

			try {
				const response = await apiClient.listPasskeys(force);
				const passkeys = response.passkeys;

				if (browser) {
					passkeyState.passkeys = passkeys;
					passkeyState.loading = false;
				}
				return passkeys;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to load passkeys';
				if (browser) {
					passkeyState.error = errorMsg;
					passkeyState.loading = false;
				}
				throw error;
			}
		},

		async createPasskey(name: string): Promise<string> {
			if (!isWebAuthnSupported()) {
				const errorMsg =
					'WebAuthn is not supported in this browser. Please use a modern browser with passkey support.';
				if (browser) {
					passkeyState.error = errorMsg;
				}
				throw new WebAuthnError(errorMsg, 'NOT_SUPPORTED');
			}

			if (browser) {
				passkeyState.loading = true;
				passkeyState.error = null;
			}

			try {
				const credentialId = await registerPasskey(name);

				await this.loadPasskeys();
				await this.loadStatus();

				if (browser) {
					passkeyState.loading = false;
				}
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

				if (browser) {
					passkeyState.error = errorMsg;
					passkeyState.loading = false;
				}
				throw error;
			}
		},

		async deletePasskey(credentialId: string): Promise<void> {
			if (browser) {
				passkeyState.loading = true;
				passkeyState.error = null;
			}

			try {
				await apiClient.deletePasskey(credentialId);

				await this.loadPasskeys();
				await this.loadStatus();

				if (browser) {
					passkeyState.loading = false;
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to delete passkey';
				if (browser) {
					passkeyState.error = errorMsg;
					passkeyState.loading = false;
				}
				throw error;
			}
		},

		async authenticateWithPasskey(): Promise<string> {
			if (!isWebAuthnSupported()) {
				const errorMsg =
					'WebAuthn is not supported in this browser. Please use a modern browser with passkey support.';
				if (browser) {
					passkeyState.error = errorMsg;
				}
				throw new WebAuthnError(errorMsg, 'NOT_SUPPORTED');
			}

			if (browser) {
				passkeyState.loading = true;
				passkeyState.error = null;
			}

			try {
				const credentialId = await webAuthnAuthenticate();

				await apiClient.unlockWithPasskey({ credentialId });

				await this.loadStatus();

				if (browser) {
					passkeyState.loading = false;
				}
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

				if (browser) {
					passkeyState.error = errorMsg;
					passkeyState.loading = false;
				}
				throw error;
			}
		},

		// Legacy method: Unlock secrets with a specific credential ID (for backwards compatibility)
		async unlockWithPasskey(credentialId: string): Promise<void> {
			if (browser) {
				passkeyState.loading = true;
				passkeyState.error = null;
			}

			try {
				await apiClient.unlockWithPasskey({ credentialId });

				// Update status to reflect unlocked state
				await this.loadStatus();

				if (browser) {
					passkeyState.loading = false;
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to unlock with passkey';
				if (browser) {
					passkeyState.error = errorMsg;
					passkeyState.loading = false;
				}
				throw error;
			}
		},

		// Clear error state
		clearError() {
			if (browser) {
				passkeyState.error = null;
			}
		},

		// Reset store to initial state
		reset() {
			if (browser) {
				Object.assign(passkeyState, defaultPasskeyState);
			}
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

// Derived exports for convenience
export const isUnlocked = () => passkeyStore.isUnlocked;
export const hasPasskeys = () => passkeyStore.hasPasskeys;
export const requiresSetup = () => passkeyStore.requiresSetup;

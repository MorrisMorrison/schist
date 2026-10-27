import { apiClient } from '#lib/api/client.ts';
import {
	registerPasskey,
	authenticateWithPasskey as webAuthnAuthenticate,
	WebAuthnError,
	isWebAuthnSupported
} from '#lib/utils/webauthn.ts';
import { runAsync } from './resource.svelte';
import { getErrorMessage } from '#lib/utils/error.ts';

import type { PasskeyInfo, PasskeyStatus } from '#lib/api/types.ts';

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

const NOT_SUPPORTED_MESSAGE =
	'WebAuthn is not supported in this browser. Please use a modern browser with passkey support.';

/**
 * Runs a WebAuthn ceremony with the store's loading/error bookkeeping. A
 * WebAuthnError is shown with the message for its code (or its own message);
 * anything else through getErrorMessage. The error is rethrown either way.
 */
async function runWebAuthn<T>(
	fn: () => Promise<T>,
	messages: Record<string, string>,
	fallback: string
): Promise<T> {
	if (!isWebAuthnSupported()) {
		passkeyState.error = NOT_SUPPORTED_MESSAGE;
		throw new WebAuthnError(NOT_SUPPORTED_MESSAGE, 'NOT_SUPPORTED');
	}

	passkeyState.loading = true;
	passkeyState.error = null;

	try {
		return await fn();
	} catch (error) {
		passkeyState.error =
			error instanceof WebAuthnError
				? (messages[error.code ?? ''] ?? error.message)
				: getErrorMessage(error, fallback);
		throw error;
	} finally {
		passkeyState.loading = false;
	}
}

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
			return runWebAuthn(
				async () => {
					const credentialId = await registerPasskey(name);

					await this.loadPasskeys();
					await this.loadStatus();

					return credentialId;
				},
				{
					USER_CANCELLED: 'Passkey creation was cancelled. Please try again.',
					CREDENTIAL_EXISTS:
						'A passkey already exists for this device. Try using a different name.',
					NOT_SUPPORTED: 'WebAuthn is not supported on this device.',
					SECURITY_ERROR: "Security error occurred. Please ensure you're on a secure connection."
				},
				'Failed to create passkey'
			);
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
			return runWebAuthn(
				async () => {
					const { credentialId, authTicket } = await webAuthnAuthenticate();

					await apiClient.unlockWithPasskey({ authTicket });

					await this.loadStatus();

					return credentialId;
				},
				{
					USER_CANCELLED: 'Authentication was cancelled. Please try again.',
					NO_CREDENTIALS: 'No matching passkeys found for this device.',
					NOT_SUPPORTED: 'WebAuthn is not supported on this device.',
					SECURITY_ERROR: 'Security error occurred during authentication.'
				},
				'Failed to authenticate with passkey'
			);
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

import { Page, CDPSession } from '@playwright/test';

export interface VirtualAuthenticatorOptions {
	protocol: 'ctap2' | 'u2f';
	transport: 'usb' | 'nfc' | 'ble' | 'internal';
	hasResidentKey: boolean;
	hasUserVerification: boolean;
	isUserVerified: boolean;
	automaticPresenceSimulation: boolean;
}

export class WebAuthnHelper {
	private page: Page;
	private client: CDPSession | null = null;
	private authenticatorId: string | null = null;

	constructor(page: Page) {
		this.page = page;
	}

	/**
	 * Initialize WebAuthn virtual authenticator for testing
	 */
	async setup(options: Partial<VirtualAuthenticatorOptions> = {}): Promise<void> {
		// Initialize CDP session
		this.client = await this.page.context().newCDPSession(this.page);

		// Enable WebAuthn environment
		await this.client.send('WebAuthn.enable');

		// Default configuration optimized for passkey testing
		const defaultOptions: VirtualAuthenticatorOptions = {
			protocol: 'ctap2',
			transport: 'internal', // Platform authenticator (Touch ID, Windows Hello, etc.)
			hasResidentKey: true, // Support discoverable credentials
			hasUserVerification: true, // Support biometric/PIN verification
			isUserVerified: true, // Auto-verify user for tests
			automaticPresenceSimulation: true // Enable automatic presence for easier testing
		};

		const authenticatorOptions = { ...defaultOptions, ...options };

		// Add virtual authenticator
		const result = await this.client.send('WebAuthn.addVirtualAuthenticator', {
			options: authenticatorOptions
		});

		this.authenticatorId = result.authenticatorId;
		console.log(`[WebAuthn] Virtual authenticator created: ${this.authenticatorId}`);
	}

	/**
	 * Simulate user presence (touching the passkey)
	 */
	async simulateUserPresence(): Promise<void> {
		if (!this.client || !this.authenticatorId) {
			throw new Error('WebAuthn not initialized. Call setup() first.');
		}

		await this.client.send('WebAuthn.setUserVerified', {
			authenticatorId: this.authenticatorId,
			isUserVerified: true
		});
	}

	/**
	 * Add a pre-existing credential to the virtual authenticator
	 */
	async addCredential(credential: {
		credentialId: string;
		privateKey: string;
		userHandle: string;
		signCount: number;
		rpId?: string;
	}): Promise<void> {
		if (!this.client || !this.authenticatorId) {
			throw new Error('WebAuthn not initialized. Call setup() first.');
		}

		try {
			await this.client.send('WebAuthn.addCredential', {
				authenticatorId: this.authenticatorId,
				credential: {
					credentialId: credential.credentialId,
					isResidentCredential: true,
					privateKey: credential.privateKey,
					userHandle: credential.userHandle,
					signCount: credential.signCount,
					rpId: credential.rpId || 'localhost'
				}
			});
			console.log(`[WebAuthn] Successfully added credential: ${credential.credentialId}`);
		} catch (error) {
			console.error(`[WebAuthn] Failed to add credential:`, error);
			console.error(`[WebAuthn] Credential data:`, JSON.stringify(credential, null, 2));
			throw error;
		}
	}

	/**
	 * Get all credentials stored in the virtual authenticator
	 */
	async getCredentials(): Promise<unknown[]> {
		if (!this.client || !this.authenticatorId) {
			throw new Error('WebAuthn not initialized. Call setup() first.');
		}

		const result = await this.client.send('WebAuthn.getCredentials', {
			authenticatorId: this.authenticatorId
		});

		return result.credentials;
	}

	/**
	 * Clear all credentials from the virtual authenticator
	 */
	async clearCredentials(): Promise<void> {
		if (!this.client || !this.authenticatorId) {
			return; // Nothing to clear if not initialized
		}

		await this.client.send('WebAuthn.clearCredentials', {
			authenticatorId: this.authenticatorId
		});
	}

	/**
	 * Remove the virtual authenticator and cleanup
	 */
	async cleanup(): Promise<void> {
		if (!this.client) {
			return;
		}

		try {
			if (this.authenticatorId) {
				await this.client.send('WebAuthn.removeVirtualAuthenticator', {
					authenticatorId: this.authenticatorId
				});
				this.authenticatorId = null;
			}

			await this.client.send('WebAuthn.disable');
		} catch (error) {
			console.warn('[WebAuthn] Cleanup error:', error);
		} finally {
			this.client = null;
		}
	}

	/**
	 * Helper method to wait for and handle passkey registration
	 */
	async waitForRegistration(timeout: number = 10000): Promise<void> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeout) {
			const credentials = await this.getCredentials();
			if (credentials.length > 0) {
				console.log(`[WebAuthn] Registration completed. Credentials: ${credentials.length}`);
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		throw new Error('Passkey registration timed out');
	}

	/**
	 * Helper method to simulate a complete passkey authentication flow
	 */
	async simulateAuthentication(): Promise<void> {
		await this.simulateUserPresence();
	}

	/**
	 * Enhanced presence simulation that ensures the authenticator is ready
	 */
	async ensureAuthenticatorReady(): Promise<void> {
		if (!this.client || !this.authenticatorId) {
			throw new Error('WebAuthn not initialized. Call setup() first.');
		}

		// Ensure user verification is enabled
		await this.client.send('WebAuthn.setUserVerified', {
			authenticatorId: this.authenticatorId,
			isUserVerified: true
		});
	}
}

/**
 * Create a WebAuthn helper for use in tests
 */
export async function createWebAuthnHelper(
	page: Page,
	options?: Partial<VirtualAuthenticatorOptions>
): Promise<WebAuthnHelper> {
	const helper = new WebAuthnHelper(page);
	await helper.setup(options);
	return helper;
}

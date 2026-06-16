import { test as setup, expect } from '@playwright/test';
import { ApiHelper } from './utils/api-helpers';
import { WebAuthnHelper } from './utils/webauthn-helper';
import { BASE_URL, LOGIN_URL, SETUP_URL } from './utils/routes';

const authFile = 'playwright/.auth/user.json';
const testUsername = 'testuser';

// Mock credential data for testing - rpId will be set dynamically
const MOCK_CREDENTIAL_BASE = {
	credentialId: Buffer.from('mock-credential-id-for-e2e-testing').toString('base64'),
	privateKey: Buffer.from('mock-private-key-for-e2e-testing-this-is-32-bytes-long!').toString('base64'),
	userHandle: Buffer.from(testUsername).toString('base64'),
	signCount: 1
};

setup('authenticate', async ({ page, request }) => {
	const apiHelper = new ApiHelper(request, `${BASE_URL}/api`);
	let webauthnHelper: WebAuthnHelper | null = null;

	// Determine rpId based on the URL - use hostname to handle both localhost and IP addresses
	const authURL = new URL(BASE_URL);
	const rpId = authURL.hostname;
	console.log(`[Auth Setup] Using rpId: ${rpId} for URL: ${BASE_URL}`);

	// Create mock credential with dynamic rpId
	const MOCK_CREDENTIAL = {
		...MOCK_CREDENTIAL_BASE,
		rpId: rpId
	};

	try {
		// Wait for the auth-enabled server to be ready
		console.log('[Auth Setup] Waiting for auth server to be ready...');
		const isReady = await apiHelper.waitForApiReady(30000);
		if (!isReady) {
			throw new Error('Auth server not ready after 30 seconds');
		}
		console.log('[Auth Setup] Auth server is ready');

		// Check server config to ensure auth is enabled
		const config = await apiHelper.getConfig();
		console.log(`[Auth Setup] Server auth_enabled: ${config.auth_enabled}`);
		if (!config.auth_enabled) {
			throw new Error('Server does not have authentication enabled');
		}

		// Set up WebAuthn virtual authenticator first (works for both new and existing users)
		webauthnHelper = new WebAuthnHelper(page);
		await webauthnHelper.setup();

		// Check if setup is required (first-time setup)
		const setupResponse = await apiHelper.checkSetupRequired();
		console.log(`[Auth Setup] Setup required: ${JSON.stringify(setupResponse.data)}`);

		if (setupResponse.status !== 200) {
			throw new Error(`Setup check failed: ${setupResponse.status}`);
		}

		const requiresSetup = (setupResponse.data as { requires_setup: boolean }).requires_setup;

		if (requiresSetup) {
			console.log('[Auth Setup] First-time setup required, creating admin user...');

			// Navigate to setup page
			await page.goto(SETUP_URL);

			// Fill in username
			await expect(page.getByLabel('Username')).toBeVisible();
			await page.getByLabel('Username').fill(testUsername);

			// Click the setup button to start passkey registration
			await page.getByRole('button', { name: /Create Account with Passkey/i }).click();

			// Wait for the success UI rather than racing the network response. The
			// WebAuthn ceremony can take well over 15s under CI load, so wait on the
			// actual completion signal with a generous timeout.
			console.log('[Auth Setup] Waiting for registration to complete...');
			await expect(page.getByText('Setup Complete!')).toBeVisible({ timeout: 45000 });
			await page.getByRole('button', { name: /Continue to Sign In/i }).click();
			await expect(page).toHaveURL(/\/login/);
		} else {
			console.log('[Auth Setup] User already exists, proceeding to login...');
			await page.goto(LOGIN_URL);
		}

		// Perform passkey authentication
		console.log('[Auth Setup] Attempting passkey authentication...');

		// Wait for login form to be ready
		await expect(page.getByRole('button', { name: /Sign in with Passkey/i })).toBeVisible();

		// Check if we have any credentials in the virtual authenticator
		let credentials = await webauthnHelper.getCredentials();
		console.log(`[Auth Setup] Available credentials: ${credentials.length}`);

		// If no credentials exist, add the mock credential for existing user
		if (credentials.length === 0) {
			console.log('[Auth Setup] No credentials found, adding mock credential for existing user...');
			await webauthnHelper.addCredential(MOCK_CREDENTIAL);

			// Wait a bit for the credential to be properly registered
			await page.waitForTimeout(200);

			credentials = await webauthnHelper.getCredentials();
			console.log(`[Auth Setup] Credentials after adding mock: ${credentials.length}`);

			if (credentials.length === 0) {
				throw new Error('Failed to add mock credential to virtual authenticator');
			}
		}

		// Ensure authenticator is ready for authentication BEFORE clicking
		try {
			await webauthnHelper.ensureAuthenticatorReady();
			console.log('[Auth Setup] Authenticator prepared for authentication');
		} catch (error) {
			console.warn('[Auth Setup] Error preparing authenticator:', error);
		}

		// Click sign in with passkey
		await page.getByRole('button', { name: /Sign in with Passkey/i }).click();

		// Wait for the post-login UI rather than racing the network response. A
		// successful sign-in redirects home and renders the nav.
		await expect(page).toHaveURL(BASE_URL, { timeout: 45000 });

		// Verify authenticated state
		await expect(page.locator('[data-testid="nav-home"]').first()).toBeVisible();

		// Save authentication state
		await page.context().storageState({ path: authFile });
		console.log(`[Auth Setup] Authentication state saved to ${authFile}`);
	} catch (error) {
		console.error('[Auth Setup] Authentication setup failed:', error);
		throw error;
	} finally {
		// Clean up WebAuthn helper
		if (webauthnHelper) {
			await webauthnHelper.cleanup();
		}
	}
});

import { test as setup, expect } from '@playwright/test';
import { ApiHelper } from './utils/api-helpers';
import { WebAuthnHelper } from './utils/webauthn-helper';
import { AUTH_ENABLED_BASE_URL, LOGIN_URL, SETUP_URL } from './utils/routes';

const authFile = 'playwright/.auth/user.json';
const testUsername = 'testuser';

// Mock credential data for testing
const MOCK_CREDENTIAL = {
	credentialId: 'bW9jay1jcmVkZW50aWFsLWlkLWZvci1lMmUtdGVzdGluZw==', // base64 encoded
	privateKey: 'bW9jay1wcml2YXRlLWtleS1mb3ItZTJlLXRlc3RpbmctdGhpcy1pcy0zMi1ieXRlcy1sb25nIQ==', // base64 encoded
	userHandle: 'dGVzdHVzZXI=', // base64 encoded 'testuser'
	signCount: 1,
	rpId: 'localhost'
};

setup('authenticate', async ({ page, request }) => {
	const apiHelper = new ApiHelper(request, 0, 'http://localhost:8082/api'); // Auth-enabled server
	let webauthnHelper: WebAuthnHelper | null = null;

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

			// Set up response monitoring before clicking
			const beginPromise = page.waitForResponse(
				(response) => {
					console.log(`[Auth Setup] Begin response: ${response.url()} - Status: ${response.status()}`);
					return response.url().includes('/passkeys/register/begin');
				},
				{ timeout: 10000 }
			).catch(e => console.log(`[Auth Setup] Begin request failed: ${e.message}`));

			const finishPromise = page.waitForResponse(
				(response) => {
					console.log(`[Auth Setup] Finish response: ${response.url()} - Status: ${response.status()}`);
					return response.url().includes('/passkeys/register/finish');
				},
				{ timeout: 15000 }
			).catch(e => console.log(`[Auth Setup] Finish request failed: ${e.message}`));

			// Monitor all network requests for debugging
			page.on('response', response => {
				console.log(`[Auth Setup] Network: ${response.url()} - ${response.status()}`);
			});

			// Monitor console for errors
			page.on('console', msg => {
				if (msg.type() === 'error') {
					console.log(`[Auth Setup] JS Error: ${msg.text()}`);
				}
			});

			// Click the setup button to start passkey registration
			console.log('[Auth Setup] Clicking Create Account with Passkey button...');
			await page.getByRole('button', { name: /Create Account with Passkey/i }).click();
			
			// Give time for immediate network requests
			console.log('[Auth Setup] Waiting for network activity...');
			await page.waitForTimeout(3000);

			// Wait for begin request first
			console.log('[Auth Setup] Waiting for registration begin...');
			await beginPromise;

			// Wait for the registration to complete by watching for the finish endpoint
			console.log('[Auth Setup] Waiting for registration to complete...');
			await finishPromise;

			// Wait for setup completion and navigate to login
			await expect(page.getByText('Setup Complete!')).toBeVisible({ timeout: 10000 });
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
			credentials = await webauthnHelper.getCredentials();
			console.log(`[Auth Setup] Credentials after adding mock: ${credentials.length}`);

			if (credentials.length === 0) {
				throw new Error('Failed to add mock credential to virtual authenticator');
			}
		}

		// Set up response listener before clicking the button
		const authFinishPromise = page.waitForResponse(
			(response) => {
				console.log(`[Auth Setup] Response: ${response.url()}`);
				return response.url().includes('/passkeys/authenticate/finish');
			},
			{ timeout: 20000 }
		);

		// Click sign in with passkey
		await page.getByRole('button', { name: /Sign in with Passkey/i }).click();

		// Add a small delay to ensure the WebAuthn API call is initiated
		await page.waitForTimeout(500);

		// Ensure authenticator is ready for authentication
		try {
			await webauthnHelper.ensureAuthenticatorReady();
			console.log('[Auth Setup] Authenticator prepared for authentication');
		} catch (error) {
			console.warn('[Auth Setup] Error preparing authenticator:', error);
		}

		// Wait for authentication to complete
		await authFinishPromise;

		// Should redirect to home page
		await expect(page).toHaveURL(AUTH_ENABLED_BASE_URL, { timeout: 10000 });

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

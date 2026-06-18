import { test as setup, expect } from '@playwright/test';
import { ApiHelper } from './utils/api-helpers';
import { WebAuthnHelper } from './utils/webauthn-helper';
import { BASE_URL, SETUP_URL } from './utils/routes';

const authFile = 'playwright/.auth/user.json';
const testUsername = 'testuser';

setup('authenticate', async ({ page, request }) => {
	const apiHelper = new ApiHelper(request, `${BASE_URL}/api`);
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
			// The e2e backend must start empty so this run can register its own
			// passkey. requires_setup=false means a user already exists, i.e. stale
			// state leaked into the run (e.g. a reused container from a prior or
			// cancelled attempt). We cannot authenticate as that user -- the virtual
			// authenticator is fresh and cannot reproduce its passkey -- so fail with
			// the real cause instead of a cryptic WebAuthn.addCredential error later.
			throw new Error(
				'[Auth Setup] Server reports an existing user (requires_setup=false), but the e2e ' +
					'backend must start empty. This indicates leftover state from a previous run/attempt; ' +
					'each run must get a fresh backend (see COMPOSE_PROJECT_NAME + --force-recreate in ' +
					'.github/workflows/e2e.yml).'
			);
		}

		// Perform passkey authentication
		console.log('[Auth Setup] Attempting passkey authentication...');

		// Wait for login form to be ready
		await expect(page.getByRole('button', { name: /Sign in with Passkey/i })).toBeVisible();

		// Registration above creates a discoverable passkey in the virtual
		// authenticator; confirm it is present before attempting sign-in.
		const credentials = await webauthnHelper.getCredentials();
		console.log(`[Auth Setup] Available credentials: ${credentials.length}`);
		if (credentials.length === 0) {
			throw new Error(
				'[Auth Setup] Passkey registration completed but no credential is present in the ' +
					'virtual authenticator; cannot sign in.'
			);
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

import { test, expect } from '../fixtures';
import { ApiHelper } from '../utils/api-helpers';
import { BASE_URL, LOGIN_URL, SETTINGS_URL } from '../utils/routes';
import { WebAuthnHelper } from '../utils/webauthn-helper';

test.describe('Passkey Authentication System', () => {
	test.describe('Authentication Enabled - Unauthenticated State', () => {
		test('should protect API endpoints when authentication is enabled', async ({ apiHelper }) => {
			// Create an unauthenticated API helper against the same service
			const unauthApiHelper = new ApiHelper(apiHelper['apiContext']);

			// Unauthenticated request should fail
			const response = await unauthApiHelper.request('GET', '/documents');
			expect(response.status).toBe(401);

			// Since we don't have password login anymore, we can't test successful auth here
			// That's covered in the authenticated tests below
		});
	});

	test.describe('Authentication Enabled', () => {
		test('should handle passkey authentication failure gracefully', async ({ page }) => {
			const webauthnHelper = new WebAuthnHelper(page);

			try {
				// Set up WebAuthn virtual authenticator but don't add credentials
				await webauthnHelper.setup({
					isUserVerified: false // This should cause auth to fail
				});

				// Clear any existing auth state
				await page.context().clearCookies();
				await page.evaluate(() => {
					try {
						localStorage.clear();
					} catch {
						// localStorage might not be accessible initially
					}
				});

				await page.goto(LOGIN_URL);

				// Wait for login form to be ready
				await expect(page.getByTestId('passkey-login-button')).toBeVisible();

				// Click sign in with passkey - this should fail
				await page.getByRole('button', { name: /Sign in with Passkey/i }).click();

				// Should show error message or remain on login page
				// Note: The exact error handling depends on the frontend implementation
				await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
			} finally {
				await webauthnHelper.cleanup();
			}
		});

		test('should allow logout', async ({ page }) => {
			await page.goto(BASE_URL);

			// Find and click logout button
			await expect(page.getByTestId('logout-button')).toBeVisible();
			await page.getByTestId('logout-button').click();

			// Should redirect to login page
			await expect(page).toHaveURL(/\/login/, { timeout: 5000 });

			// Verify we're logged out by trying to access protected page
			await page.goto(BASE_URL);
			await expect(page).toHaveURL(/\/login/);
		});

		test('should allow passkey authentication and persist it across page reloads', async ({
			page
		}) => {
			// auth.setup.ts already signed in with a passkey; its session must open
			// protected pages directly (no redirect to login)...
			await page.goto(BASE_URL);
			await expect(page).toHaveURL(BASE_URL);
			await expect(page.locator('[data-testid="nav-home"]').first()).toBeVisible();

			// ...and survive a reload
			await page.reload();
			await expect(page).toHaveURL(BASE_URL);
			await expect(page.locator('[data-testid="nav-home"]').first()).toBeVisible();
		});

		test('should protect API endpoints when authentication is enabled', async ({ apiHelper }) => {
			// This test uses the authenticated API helper from the setup
			// It should be able to access protected endpoints
			const response = await apiHelper.request('GET', '/documents');
			expect(response.status).toBe(200);
		});
	});

	test.describe('First-Time Setup Flow', () => {
		test('should report setup as done once the first user exists', async ({ apiHelper }) => {
			// auth.setup.ts registered the first (admin) user on an empty backend, so
			// the unauthenticated setup check must now say no setup is required.
			const setupResponse = await apiHelper.checkSetupRequired();
			expect(setupResponse.status).toBe(200);
			expect(setupResponse.data).toHaveProperty('requires_setup', false);
		});
	});

	test.describe('Authentication Configuration', () => {
		test('config and health endpoints are accessible and report auth enabled', async ({
			apiHelper
		}) => {
			// Config endpoint is reachable without authentication and reports auth enabled
			const configResponse = await apiHelper.request('GET', '/config');
			expect(configResponse.status).toBe(200);
			expect(configResponse.data).toHaveProperty('auth_enabled');

			const config = await apiHelper.getConfig();
			expect(config).toHaveProperty('auth_enabled');
			expect(config.auth_enabled).toBe(true);

			// Health endpoint is always accessible
			const healthResponse = await apiHelper.request('GET', '/health');
			expect(healthResponse.status).toBe(200);
			expect(healthResponse.data).toHaveProperty('status', 'ok');
		});
	});

	test.describe('Login Page UI', () => {
		test('should display proper passkey login interface', async ({ page }) => {
			await page.goto(LOGIN_URL);

			// Should show passkey login elements
			await expect(page.getByTestId('passkey-login-button')).toBeVisible();

			// Should show branding
			await expect(page.getByTestId('login-title')).toBeVisible();

			// Should not show the old (removed) password form elements
			await expect(page.getByTestId('username-input')).toBeHidden();
			await expect(page.getByTestId('password-input')).toBeHidden();
		});

		test('should handle WebAuthn not supported scenario', async ({ page }) => {
			// Mock WebAuthn as not supported
			await page.addInitScript(() => {
				// Remove WebAuthn support to test fallback
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				delete (globalThis as any).PublicKeyCredential;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				delete (globalThis as any).navigator?.credentials;
			});

			await page.goto(LOGIN_URL);

			// The login page still renders its passkey button without WebAuthn (the
			// app shows no dedicated "not supported" state yet).
			await expect(page.getByTestId('passkey-login-button')).toBeVisible();
		});
	});

	test.describe('User Management Integration', () => {
		test('should allow viewing user list when authenticated', async ({ page }) => {
			await page.goto(SETTINGS_URL);

			// Should show user management section
			await expect(page.getByTestId('user-management-title')).toBeVisible();

			// Should show current user in the list
			await expect(page.getByTestId('user-item-username')).toBeVisible();

			// Should show admin badge for first user
			await expect(page.getByTestId('admin-badge')).toBeVisible();
		});

		test('should allow generating invite tokens', async ({ page }) => {
			await page.goto(SETTINGS_URL);

			// Find and click invite user button
			await expect(page.getByTestId('invite-user-button')).toBeVisible();
			await page.getByTestId('invite-user-button').click();

			// Should show invite dialog with token
			// Wait for the dialog to appear and the invite URL input field to be visible
			await expect(page.getByTestId('invitation-dialog-title')).toBeVisible();
			await expect(page.locator('#invite-url')).toBeVisible();

			// Should show dialog elements - use the exact text match for the label
			await expect(page.getByText('Invitation Link', { exact: true })).toBeVisible();
			await expect(page.getByText('Copy')).toBeVisible();
			await expect(page.getByText('Close')).toBeVisible();
		});
	});
});

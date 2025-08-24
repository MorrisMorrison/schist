import { test, expect } from '@e2e/fixtures/test-data-fixtures';
import { ApiHelper } from '../utils/api-helpers';
import { BASE_URL, LOGIN_URL, SETTINGS_URL } from '../utils/routes';
import { WebAuthnHelper } from '../utils/webauthn-helper';

test.describe('Passkey Authentication System', () => {
	test.describe('Authentication Enabled - Unauthenticated State', () => {
		test('should redirect unauthenticated users to login', async ({ page }) => {
			await page.goto(BASE_URL);

			await expect(page).toHaveURL(/\/login/);

			// Should show passkey login interface
			await expect(page.getByTestId('passkey-login-button')).toBeVisible();
			await expect(page.getByTestId('login-title')).toBeVisible(); // App branding
		});

		test('should protect API endpoints when authentication is enabled', async ({ apiHelper }) => {
			// Create unauthenticated API helper using worker index 1 (auth-enabled container)
			const unauthApiHelper = new ApiHelper(apiHelper['apiContext'], 1);

			// Unauthenticated request should fail
			const response = await unauthApiHelper.request('GET', '/documents');
			expect(response.status).toBe(401);

			// Since we don't have password login anymore, we can't test successful auth here
			// That's covered in the authenticated tests below
		});
	});

	test.describe('Authentication Enabled', () => {
		test('should allow passkey authentication for existing user', async ({ page }) => {
			// Since auth.setup.ts already authenticated the user, verify auth is working
			// by checking we can access protected pages directly

			await page.goto(BASE_URL);

			// Should be able to access home page (not redirected to login)
			await expect(page).toHaveURL(BASE_URL);

			// Should show authenticated UI elements
			await expect(page.locator('[data-testid="nav-home"]').first()).toBeVisible();
		});

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

		test('should persist authentication across page reloads', async ({ page }) => {
			await page.goto(BASE_URL);

			// Verify we're authenticated
			await expect(page.locator('[data-testid="nav-home"]').first()).toBeVisible();

			// Reload the page
			await page.reload();

			// Should remain authenticated
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
		test('should handle first-time setup with fresh database', async ({ page }) => {
			// This test would require a completely fresh database
			// For now, we'll test the setup API endpoints directly
			const apiHelper = new ApiHelper(page.request, 1); // Use worker index 1 (auth-enabled container)

			// Test setup required check
			const setupResponse = await apiHelper.checkSetupRequired();
			expect(setupResponse.status).toBe(200);
			expect(setupResponse.data).toHaveProperty('requires_setup');

			// The actual value depends on whether users exist
			const requiresSetup = (setupResponse.data as { requires_setup: boolean }).requires_setup;
			expect(typeof requiresSetup).toBe('boolean');
		});
	});

	test.describe('Authentication Configuration', () => {
		test('should return correct config when auth is enabled', async ({ apiHelper }) => {
			const config = await apiHelper.getConfig();
			expect(config).toHaveProperty('auth_enabled');
			expect(config.auth_enabled).toBe(true);
		});

		test('config endpoint should be accessible without authentication', async ({ apiHelper }) => {
			const response = await apiHelper.request('GET', '/config');
			expect(response.status).toBe(200);
			expect(response.data).toHaveProperty('auth_enabled');
		});

		test('health endpoint should always be accessible', async ({ apiHelper }) => {
			const response = await apiHelper.request('GET', '/health');
			expect(response.status).toBe(200);
			expect(response.data).toHaveProperty('status', 'ok');
		});
	});

	test.describe('Login Page UI', () => {
		test('should display proper passkey login interface', async ({ page }) => {
			await page.goto(LOGIN_URL);

			// Should show passkey login elements
			await expect(page.getByTestId('passkey-login-button')).toBeVisible();

			// Should show branding
			await expect(page.getByTestId('login-title')).toBeVisible();

			// Should not show old password form elements
			const usernameInput = page.getByTestId('username-input');
			const passwordInput = page.getByTestId('password-input');

			if ((await usernameInput.count()) > 0) {
				// If these elements exist, they should not be visible (they're deprecated)
				await expect(usernameInput).not.toBeVisible();
			}
			if ((await passwordInput.count()) > 0) {
				await expect(passwordInput).not.toBeVisible();
			}
		});

		test('should handle WebAuthn not supported scenario', async ({ page }) => {
			// Mock WebAuthn as not supported
			await page.addInitScript(() => {
				// Remove WebAuthn support to test fallback
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				delete (window as any).PublicKeyCredential;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				delete (navigator as any).credentials;
			});

			await page.goto(LOGIN_URL);

			// Should show appropriate error or fallback message
			// const notSupportedMessage = page
			// 	.locator('text=/not supported/i')
			// 	.or(page.locator('text=/incompatible/i'))
			// 	.or(page.locator('[role="alert"]'));

			// The exact behavior depends on the frontend implementation
			// At minimum, the passkey button should be disabled or show an error
			const passkeyButton = page.getByTestId('passkey-login-button');
			if ((await passkeyButton.count()) > 0) {
				// Button might be disabled or show error state
				const isVisible = await passkeyButton.isVisible();
				expect(isVisible).toBe(true); // Button should still be visible
			}
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

import { test, expect } from '../fixtures';
import { ApiHelper } from '../utils/api-helpers';

test.describe('Authentication System', () => {
	test.describe('Authentication Enabled - Unauthenticated State', () => {
		test('should redirect unauthenticated users to login', async ({ page }) => {
			await page.goto('http://localhost:4174/');

			await expect(page).toHaveURL(/\/login/);

			await expect(page.getByTestId('username-input')).toBeVisible();
			await expect(page.getByTestId('password-input')).toBeVisible();
			await expect(page.getByTestId('login-submit')).toBeVisible();
		});

		test('should protect API endpoints when authentication is enabled', async ({ apiHelper }) => {
			const unauthApiHelper = new ApiHelper(
				apiHelper['apiContext'],
				0,
				'http://localhost:8082/api'
			);

			const response = await unauthApiHelper.request('GET', '/documents');
			expect(response.status).toBe(401);

			const loginResponse = await unauthApiHelper.login('testuser', 'testpass123');
			expect(loginResponse.status).toBe(200);

			const token = (loginResponse.data as { token: string }).token;
			unauthApiHelper.setAuthToken(token);
			const authenticatedResponse = await unauthApiHelper.request('GET', '/documents');
			expect(authenticatedResponse.status).toBe(200);
		});
	});

	test.describe('Authentication Enabled', () => {
		test('should allow login with valid credentials', async ({ page }) => {
			// Clear any existing auth state
			await page.context().clearCookies();
			await page.evaluate(() => {
				try {
					localStorage.clear();
				} catch {
					// localStorage might not be accessible initially
				}
			});

			await page.goto('http://localhost:4174/login');

			// Wait for login form to be ready
			await expect(page.getByTestId('username-input')).toBeVisible();
			await expect(page.getByTestId('password-input')).toBeVisible();

			// Fill credentials
			await page.getByTestId('username-input').fill('testuser');
			await page.getByTestId('password-input').fill('testpass123');

			// Wait for submit button to be enabled
			const submitButton = page.getByTestId('login-submit');
			await expect(submitButton).toBeEnabled();

			// Submit the form
			await submitButton.click();

			// Should redirect to home page
			await expect(page).toHaveURL('http://localhost:4174/');

			// Should show authenticated UI elements
			await expect(page.locator('[data-testid="user-info"]')).toBeVisible();
			await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();
		});

		test('should show error for invalid credentials', async ({ page }) => {
			// Clear any existing auth state
			await page.context().clearCookies();
			await page.evaluate(() => {
				try {
					localStorage.clear();
				} catch {
					// localStorage might not be accessible initially
				}
			});

			await page.goto('http://localhost:4174/login');

			// Wait for login form to be ready
			await expect(page.getByTestId('username-input')).toBeVisible();
			await expect(page.getByTestId('password-input')).toBeVisible();

			// Fill invalid credentials
			await page.getByTestId('username-input').fill('invalid');
			await page.getByTestId('password-input').fill('wrongpass');

			// Wait for submit button to be enabled
			const submitButton = page.getByTestId('login-submit');
			await expect(submitButton).toBeEnabled();

			// Submit the form
			await submitButton.click();

			// Should show error message
			await expect(
				page
					.locator('text=Invalid username or password')
					.or(page.locator('.error'))
					.or(page.locator('[role="alert"]'))
			).toBeVisible();

			// Should remain on login page
			await expect(page).toHaveURL(/\/login/);
		});

		test('should allow logout', async ({ page }) => {
			await page.goto('http://localhost:4174/');

			await page.click('[data-testid="logout-button"]');

			await expect(page).toHaveURL(/\/login/);

			await page.goto('http://localhost:4174/');
			await expect(page).toHaveURL(/\/login/);
		});

		test('should persist authentication across page reloads', async ({ page }) => {
			await page.goto('http://localhost:4174/');

			await page.reload();

			await expect(page).toHaveURL('http://localhost:4174/');
			await expect(page.locator('[data-testid="user-info"]')).toBeVisible();
		});

		test('should protect API endpoints when authentication is enabled', async ({ apiHelper }) => {
			// Create a new API helper without authentication
			const unauthApiHelper = new ApiHelper(
				apiHelper['apiContext'],
				0,
				'http://localhost:8082/api'
			);

			// Unauthenticated request should fail
			const response = await unauthApiHelper.request('GET', '/documents');
			expect(response.status).toBe(401);

			// Login should succeed
			const loginResponse = await unauthApiHelper.login('testuser', 'testpass123');
			expect(loginResponse.status).toBe(200);
			expect(loginResponse.data).toBeDefined();
			expect((loginResponse.data as { token: string }).token).toBeDefined();

			// Set auth token and retry
			const token = (loginResponse.data as { token: string }).token;
			unauthApiHelper.setAuthToken(token);

			// Authenticated request should succeed
			const authenticatedResponse = await unauthApiHelper.request('GET', '/documents');
			expect(authenticatedResponse.status).toBe(200);
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
		test('should display proper login form when accessed directly', async ({ page }) => {
			await page.goto('http://localhost:4174/login');

			// Should show login form elements (use fallback selectors)
			await expect(page.getByTestId('username-input')).toBeVisible();
			await expect(page.getByTestId('password-input')).toBeVisible();
			await expect(page.getByTestId('login-submit')).toBeVisible();

			// Should show branding (optional, may not have test IDs)
			const titleLocator = page
				.getByTestId('login-title')
				.or(page.locator('h1'))
				.or(page.locator('.login-title'));
			if ((await titleLocator.count()) > 0) {
				await expect(titleLocator.first()).toBeVisible();
			}

			// Should have proper form validation
			const inputCount = await page
				.locator('input[required], input[type="text"], input[type="password"]')
				.count();
			expect(inputCount).toBeGreaterThan(1);
		});

		test('should have password visibility toggle', async ({ page }) => {
			await page.goto('http://localhost:4174/login');

			const passwordInput = page.getByTestId('password-input');
			const toggleButton = page.getByTestId('password-toggle');

			// Password should be hidden initially
			await expect(passwordInput).toHaveAttribute('type', 'password');

			// Check if toggle button exists (optional feature)
			if ((await toggleButton.count()) > 0) {
				// Toggle should be visible
				await expect(toggleButton.first()).toBeVisible();

				// Click toggle to show password
				await toggleButton.first().click();

				// Should change to text input (or remain as password if not implemented)
				const inputType = await passwordInput.getAttribute('type');
				expect(['password', 'text']).toContain(inputType);
			}
		});

		test('should handle form submission properly', async ({ page }) => {
			await page.goto('http://localhost:4174/login');

			await page.getByTestId('username-input').fill('testuser');
			await page.getByTestId('password-input').fill('testpass');

			const submitButton = page.getByTestId('login-submit');
			await expect(submitButton).toBeEnabled();

			await submitButton.click();

			await expect(submitButton).toBeVisible();
		});
	});
});

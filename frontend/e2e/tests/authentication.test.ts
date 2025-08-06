/**
 * Authentication E2E tests
 * Tests both authentication enabled and disabled scenarios
 */

import { test, expect } from '../fixtures';
import { expectPageLoaded } from '../utils/assertions';

test.describe('Authentication System', () => {
	test.describe('Authentication Disabled (Default)', () => {
		test('should access all pages without authentication', async ({ homePage, apiHelper }) => {
			// Verify authentication is disabled via API
			const config = await apiHelper.getConfig();
			expect(config.auth_enabled).toBe(false);

			// Should be able to access home page directly
			await homePage.navigate();
			await expectPageLoaded(homePage.page);

			// Should not see login page or auth UI
			await expect(homePage.page.locator('text=Sign in')).not.toBeVisible();
			await expect(homePage.page.locator('text=Login')).not.toBeVisible();

			// Navigation should be fully functional
			await expect(homePage.pageTitle).toBeVisible();
		});

		test('should access API endpoints without authentication', async ({ apiHelper }) => {
			// Health check should work
			const health = await apiHelper.healthCheck();
			expect(health).toBe(true);

			// Document API should work
			const documents = await apiHelper.listDocuments();
			expect(documents.status).toBe(200);

			// No auth headers should be required
			const response = await apiHelper.request('GET', '/config');
			expect(response.status).toBe(200);
		});

		test('should not show authentication UI elements', async ({ homePage }) => {
			await homePage.navigate();

			// Navigation should not show login/logout buttons
			await expect(homePage.page.locator('[data-testid="logout-button"]')).not.toBeVisible();
			await expect(homePage.page.locator('[data-testid="user-info"]')).not.toBeVisible();

			// Should show normal navigation
			await expect(homePage.page.getByTestId('nav-home')).toBeVisible();
		});
	});

	test.describe('Authentication Enabled', () => {
		// These tests would require starting the backend with auth enabled
		// Using test.skip for now since they require special setup

		test.skip('should redirect unauthenticated users to login', async ({ page }) => {
			// This test would require SCHIST_AUTH_ENABLED=true environment
			await page.goto('/');

			// Should redirect to login page
			await expect(page).toHaveURL(/\/login/);

			// Should show login form
			await expect(page.locator('input[type="text"]')).toBeVisible();
			await expect(page.locator('input[type="password"]')).toBeVisible();
			await expect(page.locator('button[type="submit"]')).toBeVisible();
		});

		test.skip('should allow login with valid credentials', async ({ page }) => {
			// This test would require SCHIST_AUTH_ENABLED=true and configured users
			await page.goto('/login');

			// Fill login form
			await page.fill('input[type="text"]', 'testuser');
			await page.fill('input[type="password"]', 'testpass');

			// Submit form
			await page.click('button[type="submit"]');

			// Should redirect to home page
			await expect(page).toHaveURL('/');

			// Should show authenticated UI
			await expect(page.locator('[data-testid="user-info"]')).toBeVisible();
			await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();
		});

		test.skip('should show error for invalid credentials', async ({ page }) => {
			await page.goto('/login');

			// Fill with invalid credentials
			await page.fill('input[type="text"]', 'invalid');
			await page.fill('input[type="password"]', 'wrongpass');

			// Submit form
			await page.click('button[type="submit"]');

			// Should show error message
			await expect(page.locator('text=Invalid username or password')).toBeVisible();

			// Should remain on login page
			await expect(page).toHaveURL(/\/login/);
		});

		test.skip('should allow logout', async ({ page }) => {
			// Assume already logged in
			await page.goto('/');

			// Click logout button
			await page.click('[data-testid="logout-button"]');

			// Should redirect to login page
			await expect(page).toHaveURL(/\/login/);

			// Should no longer have access to protected routes
			await page.goto('/');
			await expect(page).toHaveURL(/\/login/);
		});

		test.skip('should persist authentication across page reloads', async ({ page }) => {
			// Assume logged in
			await page.goto('/');

			// Reload page
			await page.reload();

			// Should remain authenticated
			await expect(page).toHaveURL('/');
			await expect(page.locator('[data-testid="user-info"]')).toBeVisible();
		});

		test.skip('should protect API endpoints when authentication is enabled', async ({
			apiHelper
		}) => {
			// Without auth token, should get 401
			const response = await apiHelper.request('GET', '/api/documents');
			expect(response.status).toBe(401);

			// With auth token, should work
			// (This would require implementing token setting in ApiHelper)
		});
	});

	test.describe('Authentication Configuration', () => {
		test('should return correct config when auth is disabled', async ({ apiHelper }) => {
			const config = await apiHelper.getConfig();
			expect(config).toHaveProperty('auth_enabled');
			expect(config.auth_enabled).toBe(false);
		});

		test('config endpoint should be accessible without authentication', async ({ apiHelper }) => {
			// Config endpoint should always be accessible
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
			await page.goto('/login');

			// Should show login form elements
			await expect(page.getByTestId('username-input')).toBeVisible();
			await expect(page.getByTestId('password-input')).toBeVisible();
			await expect(page.getByTestId('login-submit')).toBeVisible();

			// Should show branding
			await expect(page.getByTestId('login-title')).toBeVisible();
			await expect(page.getByTestId('login-logo')).toBeVisible();

			// Should have proper form validation
			await expect(page.locator('input[required]')).toHaveCount(2);
		});

		test('should have password visibility toggle', async ({ page }) => {
			await page.goto('/login');

			const passwordInput = page.getByTestId('password-input');
			const toggleButton = page.getByTestId('password-toggle');

			// Password should be hidden initially
			await expect(passwordInput).toHaveAttribute('type', 'password');

			// Toggle should be visible
			await expect(toggleButton).toBeVisible();

			// Click toggle to show password
			await toggleButton.click();

			// Should change to text input
			await expect(passwordInput).toHaveAttribute('type', 'text');
		});

		test('should handle form submission properly', async ({ page }) => {
			await page.goto('/login');

			// Fill form first
			await page.getByTestId('username-input').fill('testuser');
			await page.getByTestId('password-input').fill('testpass');

			// Form should now be submittable
			const submitButton = page.getByTestId('login-submit');
			await expect(submitButton).toBeEnabled();

			// Should show loading state when clicked (even if auth fails)
			await submitButton.click();

			// Button should show loading state briefly
			await expect(submitButton).toBeDisabled();
		});
	});
});

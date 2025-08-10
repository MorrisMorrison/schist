import { test, expect } from '@playwright/test';
import { test as fixtureTest } from '../fixtures/test-data-fixtures';

test.describe('Recent Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should navigate to recent page from navbar', async ({ page }) => {
		await page.click('[data-testid="nav-recent"]');

		await expect(page).toHaveURL('/recent');

		await expect(page.locator('h1')).toContainText('Recent Documents');
	});

	test('should handle empty state gracefully', async ({ page }) => {
		await page.click('[data-testid="nav-recent"]');

		await expect(page).toHaveURL('/recent');
		await expect(page.locator('h1')).toContainText('Recent Documents');

		await expect(page.locator('text=No recent activity')).toBeVisible();
		await expect(page.locator('text=Loading...')).not.toBeVisible();
	});

	test('should work with direct URL access', async ({ page }) => {
		await page.goto('/recent');

		await expect(page.locator('h1')).toContainText('Recent Documents');
	});

	test('should display error state when API fails', async ({ page }) => {
		// Set up route interception before any navigation
		await page.route('**/api/documents', (route) => {
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'Internal server error' })
			});
		});

		await page.route('**/api/folders', (route) => {
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'Internal server error' })
			});
		});

		// Now go to recent page
		await page.goto('/recent');

		await expect(page.locator('text=Error loading documents')).toBeVisible();
	});
});

fixtureTest.describe('Recent Page with Data', () => {
	fixtureTest('should display recent documents after navigation', async ({ page, homePage, withMultipleDocuments }) => {
		await page.click('[data-testid="nav-recent"]');

		await expect(page.locator('h1')).toContainText('Recent Documents');

		await expect(page.locator('[data-testid="document-card"]').first()).toBeVisible();

		await expect(page.locator('text=No recent activity')).not.toBeVisible();
		await expect(page.locator('text=Loading...')).not.toBeVisible();
	});

	fixtureTest(
		'should display multiple documents in recent view',
		async ({ page, withMultipleDocuments }) => {
			await page.goto('/recent');

			await expect(page.locator('h1')).toContainText('Recent Documents');
			await expect(page.locator('[data-testid="document-card"]')).toHaveCount(
				withMultipleDocuments.length
			);
		}
	);
});

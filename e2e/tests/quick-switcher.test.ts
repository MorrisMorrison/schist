import { test, expect } from '@playwright/test';
import { test as fixtureTest } from '../fixtures/test-data-fixtures';

test.describe('Quick Switcher', () => {
	test.beforeEach(async ({ page }) => {
		// Set viewport to desktop size to ensure QuickSwitcher button is visible
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto('/');
		await page.waitForLoadState('networkidle');
	});

	test('should open quick switcher with button click', async ({ page }) => {
		// Wait for the quick switcher button to be visible
		await expect(page.locator('[data-testid="quick-switcher-button"]')).toBeVisible();

		// Click the search button
		await page.click('[data-testid="quick-switcher-button"]');

		await expect(page.locator('[data-testid="quick-switcher"]')).toBeVisible();
		await expect(page.locator('[data-testid="quick-switcher-input"]')).toBeFocused();
	});

	test('should close quick switcher when clicking outside or escape', async ({ page }) => {
		// Wait for the quick switcher button to be visible
		await expect(page.locator('[data-testid="quick-switcher-button"]')).toBeVisible();

		// Open the quick switcher with button click
		await page.click('[data-testid="quick-switcher-button"]');
		await expect(page.locator('[data-testid="quick-switcher"]')).toBeVisible();

		// Close with Escape key
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-testid="quick-switcher"]')).not.toBeVisible();
	});

	test('should work when API returns empty documents', async ({ page }) => {
		// Set up route before navigating to the page
		await page.route('/api/documents', (route) => {
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ documents: [] })
			});
		});

		// Navigate again to ensure the route is active
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		// Wait for the quick switcher button to be visible
		await expect(page.locator('[data-testid="quick-switcher-button"]')).toBeVisible();

		// Open quick switcher with button click
		await page.click('[data-testid="quick-switcher-button"]');
		await expect(page.locator('[data-testid="quick-switcher"]')).toBeVisible();

		await page.fill('[data-testid="quick-switcher-input"]', 'anything');

		await expect(page.locator('text=No documents found')).toBeVisible();
	});

	test('should handle API errors gracefully', async ({ page }) => {
		let apiCallAttempted = false;

		// Intercept any API call to documents endpoint
		await page.route('**/api/documents*', (route) => {
			apiCallAttempted = true;
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'Internal server error' })
			});
		});

		// Navigate again to ensure the route is active
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		// Wait for the quick switcher button to be visible
		await expect(page.locator('[data-testid="quick-switcher-button"]')).toBeVisible();

		// Open quick switcher with button click
		await page.click('[data-testid="quick-switcher-button"]');
		await expect(page.locator('[data-testid="quick-switcher"]')).toBeVisible();

		await page.fill('[data-testid="quick-switcher-input"]', 'test');

		// Wait a bit for the API call to be made
		await page.waitForTimeout(500);

		await expect(page.locator('text=No documents found')).toBeVisible();

		expect(apiCallAttempted).toBe(true);
	});
});

fixtureTest.describe('Quick Switcher with Data', () => {
	fixtureTest('should search documents successfully', async ({ page, withTestDocument }) => {
		// Navigate to home page and ensure proper loading
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		// Wait for the quick switcher button to be visible
		await expect(page.locator('[data-testid="quick-switcher-button"]')).toBeVisible();

		// Open quick switcher with button click
		await page.click('[data-testid="quick-switcher-button"]');
		await expect(page.locator('[data-testid="quick-switcher"]')).toBeVisible();

		await page.fill('[data-testid="quick-switcher-input"]', withTestDocument.title.split(' ')[0]);

		await expect(
			page.locator('[data-testid="quick-switcher"]').locator(`text=${withTestDocument.title}`)
		).toBeVisible();
	});

	fixtureTest('should handle no search results gracefully', async ({ page }) => {
		// Navigate to home page and ensure proper loading
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		// Wait for the quick switcher button to be visible
		await expect(page.locator('[data-testid="quick-switcher-button"]')).toBeVisible();

		// Open quick switcher with button click
		await page.click('[data-testid="quick-switcher-button"]');
		await expect(page.locator('[data-testid="quick-switcher"]')).toBeVisible();
		await page.fill('[data-testid="quick-switcher-input"]', 'nonexistent');

		await expect(page.locator('text=No documents found')).toBeVisible();
	});

	fixtureTest('should navigate to selected document', async ({ page, withTestDocument }) => {
		// Navigate to home page and ensure proper loading
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		// Wait for the quick switcher button to be visible
		await expect(page.locator('[data-testid="quick-switcher-button"]')).toBeVisible();

		// Open quick switcher with button click
		await page.click('[data-testid="quick-switcher-button"]');
		await expect(page.locator('[data-testid="quick-switcher"]')).toBeVisible();
		await page.fill('[data-testid="quick-switcher-input"]', withTestDocument.title.split(' ')[0]);

		await expect(
			page.locator('[data-testid="quick-switcher"]').locator(`text=${withTestDocument.title}`)
		).toBeVisible();

		await page.keyboard.press('Enter');

		await expect(page).toHaveURL(`/documents/${withTestDocument.slug || withTestDocument.title}`);
	});
});

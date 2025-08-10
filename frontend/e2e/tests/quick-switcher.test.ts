import { test, expect } from '@playwright/test';
import { test as fixtureTest } from '../fixtures/test-data-fixtures';

test.describe('Quick Switcher', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should open quick switcher with Ctrl+K', async ({ page }) => {
		await page.keyboard.press('Control+k');

		await expect(page.locator('[data-testid="quick-switcher"]')).toBeVisible();
		await expect(page.locator('[data-testid="quick-switcher-input"]')).toBeFocused();
	});

	test('should work when API returns empty documents', async ({ page }) => {
		await page.route('/api/documents', (route) => {
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ documents: [] })
			});
		});

		await page.keyboard.press('Control+k');
		await expect(page.locator('[data-testid="quick-switcher"]')).toBeVisible();

		await page.fill('[data-testid="quick-switcher-input"]', 'anything');

		await expect(page.locator('text=No results found')).toBeVisible();
	});

	test('should handle API errors gracefully', async ({ page }) => {
		let apiCallAttempted = false;

		await page.route('/api/documents', (route) => {
			apiCallAttempted = true;
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'Internal server error' })
			});
		});

		await page.keyboard.press('Control+k');
		await expect(page.locator('[data-testid="quick-switcher"]')).toBeVisible();

		await page.fill('[data-testid="quick-switcher-input"]', 'test');

		await expect(page.locator('text=No results found')).toBeVisible();

		expect(apiCallAttempted).toBe(true);
	});
});

fixtureTest.describe('Quick Switcher with Data', () => {
	fixtureTest('should search documents successfully', async ({ page, withTestDocument }) => {
		await page.keyboard.press('Control+k');
		await expect(page.locator('[data-testid="quick-switcher"]')).toBeVisible();

		await page.fill('[data-testid="quick-switcher-input"]', withTestDocument.title.split(' ')[0]);

		await expect(page.locator(`text=${withTestDocument.title}`)).toBeVisible();
	});

	fixtureTest('should handle no search results gracefully', async ({ page }) => {
		await page.keyboard.press('Control+k');
		await page.fill('[data-testid="quick-switcher-input"]', 'nonexistent');

		await expect(page.locator('text=No results found')).toBeVisible();
	});

	fixtureTest('should navigate to selected document', async ({ page, withTestDocument }) => {
		await page.keyboard.press('Control+k');
		await page.fill('[data-testid="quick-switcher-input"]', withTestDocument.title.split(' ')[0]);

		await expect(page.locator(`text=${withTestDocument.title}`)).toBeVisible();

		await page.keyboard.press('Enter');

		await expect(page).toHaveURL(`/documents/${withTestDocument.slug || withTestDocument.title}`);
	});
});

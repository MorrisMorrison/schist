import { test, expect } from '../fixtures';

test.describe('Quick Switcher', () => {
	test.beforeEach(async ({ page }) => {
		// Set viewport to desktop size to ensure QuickSwitcher button is visible
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto('/');
	});

	test('should open quick switcher with button click and close it with escape', async ({
		homePage,
		page
	}) => {
		await homePage.openQuickSwitcher();

		// Close with Escape key
		await page.keyboard.press('Escape');
		await expect(homePage.quickSwitcher).not.toBeVisible();
	});

	test('should handle API errors gracefully', async ({ homePage, page }) => {
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

		await homePage.openQuickSwitcher();
		await homePage.quickSwitcherInput.fill('test');

		await expect(homePage.quickSwitcher.getByText('No documents found')).toBeVisible();

		expect(apiCallAttempted).toBe(true);
	});
});

test.describe('Quick Switcher with Data', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should handle no search results gracefully', async ({ homePage }) => {
		await homePage.openQuickSwitcher();
		await homePage.quickSwitcherInput.fill('nonexistent');

		await expect(homePage.quickSwitcher.getByText('No documents found')).toBeVisible();
	});

	test('should find a document and navigate to it', async ({
		homePage,
		page,
		withTestDocument
	}) => {
		await homePage.openQuickSwitcher();
		await homePage.quickSwitcherInput.fill(withTestDocument.title.split(' ')[0]);

		await expect(homePage.quickSwitcher.getByText(withTestDocument.title)).toBeVisible();

		await page.keyboard.press('Enter');

		await expect(page).toHaveURL(`/documents${withTestDocument.path}`);
	});
});

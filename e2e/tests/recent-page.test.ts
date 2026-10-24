import { test, expect } from '../fixtures';

test.describe('Recent Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should navigate to recent page from navbar', async ({ page }) => {
		await page.getByTestId('nav-recent').click();

		await expect(page).toHaveURL('/recent');

		await expect(page.locator('h1')).toContainText('Recent Documents');
	});

	test('should handle empty state gracefully', async ({ page }) => {
		await page.getByTestId('nav-recent').click();

		await expect(page).toHaveURL('/recent');
		await expect(page.locator('h1')).toContainText('Recent Documents');

		await expect(page.getByText('No recent activity')).toBeVisible();
		await expect(page.getByText('Loading...')).not.toBeVisible();
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

		await expect(page.getByText('Error loading documents')).toBeVisible();
	});
});

test.describe('Recent Page with Data', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should display recent documents after navigation', async ({
		page,
		withMultipleDocuments: _withMultipleDocuments
	}) => {
		// Test data is automatically available via the withMultipleDocuments fixture
		await page.getByTestId('nav-recent').click();

		await expect(page.locator('h1')).toContainText('Recent Documents');

		await expect(page.getByTestId('document-card').first()).toBeVisible();

		await expect(page.getByText('No recent activity')).not.toBeVisible();
		await expect(page.getByText('Loading...')).not.toBeVisible();
	});

	test('should display multiple documents in recent view', async ({
		page,
		withMultipleDocuments
	}) => {
		await page.goto('/recent');

		await expect(page.locator('h1')).toContainText('Recent Documents');
		await expect(page.getByTestId('document-card')).toHaveCount(withMultipleDocuments.length);
	});
});

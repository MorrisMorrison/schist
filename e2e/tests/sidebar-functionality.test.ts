import { test, expect } from '@playwright/test';

test.describe('Sidebar Functionality', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should open document creation when clicking + button', async ({ page }) => {
		await page.click('[title="Create new document"]');

		await expect(page).toHaveURL(/\/new/);
	});

	test('should show tooltip on + button hover', async ({ page }) => {
		const plusButton = page.locator('[title="Create new document"]');

		await expect(plusButton).toBeVisible();
		await expect(plusButton).toHaveAttribute('title', 'Create new document');
	});
});

import { test, expect } from '@playwright/test';

test.describe('Simple E2E Test', () => {
	test('should load home page', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('h1')).toBeVisible();
	});
});

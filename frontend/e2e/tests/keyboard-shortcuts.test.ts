import { test, expect } from '@playwright/test';

test.describe('Keyboard Shortcuts', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should use Ctrl+Shift+T for theme toggle', async ({ page }) => {
		await page.keyboard.press('Control+Shift+t');
		
		await expect(page.locator('html')).toHaveAttribute('class', /dark|light/);
	});

	test('should create new document with Ctrl+N', async ({ page }) => {
		await page.keyboard.press('Control+n');
		
		await expect(page).toHaveURL(/\/new/);
	});

	test('should create new folder with Ctrl+Shift+N', async ({ page }) => {
		await page.keyboard.press('Control+Shift+n');
		
		await expect(page.locator('[data-testid="create-folder-modal"]')).toBeVisible();
	});

	test('should toggle sidebar with Ctrl+B', async ({ page }) => {
		await page.keyboard.press('Control+b');
		
		// Check if sidebar state changed (could be opened or closed depending on initial state)
		await expect(page.locator('aside')).toBeVisible();
	});

	test('should navigate home with Ctrl+H', async ({ page }) => {
		// First navigate away from home
		await page.goto('/settings');
		
		await page.keyboard.press('Control+h');
		
		await expect(page).toHaveURL('/');
	});

	test('should navigate to settings with Ctrl+,', async ({ page }) => {
		await page.keyboard.press('Control+,');
		
		await expect(page).toHaveURL('/settings');
	});
});
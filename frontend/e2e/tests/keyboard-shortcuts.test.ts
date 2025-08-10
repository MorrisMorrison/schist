import { test, expect } from '@playwright/test';

test.describe('Keyboard Shortcuts', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should use Ctrl+Alt+T for theme toggle', async ({ page }) => {
		await page.keyboard.press('Control+Alt+t');

		await expect(page.locator('html')).toHaveAttribute('class', /dark|light/);
	});

	test('should create new document with Ctrl+Alt+N', async ({ page }) => {
		await page.keyboard.press('Control+Alt+n');

		await expect(page).toHaveURL(/\/new/);
	});

	test('should create new folder with Ctrl+Alt+F', async ({ page }) => {
		await page.keyboard.press('Control+Alt+f');

		await expect(page.locator('[data-testid="create-folder-modal"]')).toBeVisible();
	});

	test('should toggle sidebar with Ctrl+B', async ({ page }) => {
		await page.keyboard.press('Control+b');

		// Check if sidebar state changed (could be opened or closed depending on initial state)
		await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
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

test.describe('Document Keyboard Shortcuts', () => {
	test.beforeEach(async ({ page }) => {
		// Need to be on a document page to test document shortcuts
		await page.goto('/documents/test-doc');
	});

	test('should download document with Ctrl+J', async ({ page }) => {
		// Start listening for download before triggering
		const downloadPromise = page.waitForEvent('download');

		await page.keyboard.press('Control+j');

		// Wait for download to start
		await downloadPromise;
	});

	test('should navigate to edit with Ctrl+E', async ({ page }) => {
		await page.keyboard.press('Control+e');

		await expect(page).toHaveURL(/\/edit\/test-doc/);
	});
});

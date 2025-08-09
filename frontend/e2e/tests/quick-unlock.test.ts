import { test, expect } from '../fixtures';

test.describe('Quick Unlock Feature', () => {
	test('should show quick unlock button when secrets are locked', async ({ page }) => {
		// Go to any authenticated page
		await page.goto('http://localhost:4174/');

		// Should show the quick unlock button when secrets are locked
		await expect(page.getByTestId('quick-unlock-button')).toBeVisible();

		// Should show lock icon
		await expect(page.getByTestId('quick-unlock-button').locator('svg')).toBeVisible();
	});

	test('should show unlocked indicator after secrets are unlocked', async ({ page }) => {
		// Go to any authenticated page
		await page.goto('http://localhost:4174/');

		// Click the quick unlock button
		await page.getByTestId('quick-unlock-button').click();

		// Wait for unlock process to complete (WebAuthn simulation happens automatically)
		await expect(page.getByTestId('secrets-unlocked-indicator')).toBeVisible({ timeout: 10000 });

		// Quick unlock button should be hidden now
		await expect(page.getByTestId('quick-unlock-button')).not.toBeVisible();

		// Should show unlocked indicator with unlock icon
		await expect(page.getByTestId('secrets-unlocked-indicator').locator('svg')).toBeVisible();
	});

	test('should work in mobile menu as well', async ({ page }) => {
		// Set mobile viewport
		await page.setViewportSize({ width: 375, height: 667 });

		// Go to any authenticated page
		await page.goto('http://localhost:4174/');

		// Open mobile menu
		await page.locator('button[aria-expanded]').click();

		// Should show mobile quick unlock button
		await expect(page.getByTestId('quick-unlock-button-mobile')).toBeVisible();

		// Should show "Unlock Secrets" text
		await expect(page.getByText('Unlock Secrets')).toBeVisible();
	});
});

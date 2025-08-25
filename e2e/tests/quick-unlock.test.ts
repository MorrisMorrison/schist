import { test, expect } from '../fixtures/test-data-fixtures';
import { BASE_URL } from '../utils/routes';

test.describe('Quick Unlock Feature', () => {
	test('should show quick unlock button when secrets are locked', async ({ page }) => {
		// Go to any authenticated page
		await page.goto(BASE_URL);

		// Should show the quick unlock button when secrets are locked
		await expect(page.getByTestId('quick-unlock-button')).toBeVisible();

		// Should show lock icon
		await expect(page.getByTestId('quick-unlock-button').locator('svg')).toBeVisible();
	});

	test('should work in mobile menu as well', async ({ page }) => {
		// Set mobile viewport
		await page.setViewportSize({ width: 375, height: 667 });

		// Go to any authenticated page
		await page.goto(BASE_URL);

		// Open mobile menu (the one that's visible on mobile - md:hidden)
		await page.locator('button[aria-expanded].md\\:hidden').click();

		// Should show mobile quick unlock button
		await expect(page.getByTestId('quick-unlock-button-mobile')).toBeVisible();

		// Should show "Unlock Secrets" text
		await expect(page.getByText('Unlock Secrets')).toBeVisible();
	});
});

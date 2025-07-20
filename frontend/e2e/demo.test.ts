/**
 * Legacy demo test - replaced by infrastructure.spec.ts
 * Keeping this simple test for backward compatibility
 */

import { expect, test } from '@playwright/test';

test('home page has expected h1', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
});

import { type Page, type Locator, expect } from '@playwright/test';

export async function expectVisibleText(locator: Locator, expectedText: string) {
	await expect(locator).toBeVisible();
	await expect(locator).toContainText(expectedText);
}

export async function expectPageLoaded(page: Page) {
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('loading')).not.toBeVisible();
}

import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Base page class containing common functionality for all page objects
 */
export abstract class BasePage {
	readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	/**
	 * Navigate to a specific path
	 */
	async goto(path: string = '/') {
		await this.page.goto(path);
	}

	/**
	 * Wait for page to load completely
	 */
	async waitForLoad() {
		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Get page title
	 */
	async getTitle(): Promise<string> {
		return await this.page.title();
	}

	/**
	 * Check if current URL matches expected path
	 */
	async expectUrl(expectedPath: string) {
		await expect(this.page).toHaveURL(new RegExp(expectedPath));
	}

	/**
	 * Wait for element to be visible with retry logic
	 */
	async waitForVisible(locator: Locator, timeoutMs: number = 10000) {
		await expect(locator).toBeVisible({ timeout: timeoutMs });
	}

	/**
	 * Wait for page to be stable (no pending network requests or DOM changes)
	 */
	async waitForPageStable() {
		// Wait for any pending navigation
		await this.page.waitForLoadState('networkidle');

		// Wait for any dynamic content to load
		await this.page.waitForTimeout(500);

		// Ensure DOM is stable
		await this.page.waitForLoadState('domcontentloaded');
	}

	/**
	 * Fill input field and verify value
	 */
	async fillInput(locator: Locator, value: string) {
		await locator.fill(value);
		await expect(locator).toHaveValue(value);
	}

	/**
	 * Click button and wait for any navigation
	 */
	async clickAndWait(locator: Locator) {
		await Promise.all([this.page.waitForLoadState('networkidle'), locator.click()]);
	}

	/**
	 * Take screenshot with a descriptive name
	 */
	async screenshot(name: string) {
		await this.page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
	}

	/**
	 * Scroll element into view
	 */
	async scrollIntoView(locator: Locator) {
		await locator.scrollIntoViewIfNeeded();
	}

	/**
	 * Wait for network requests to complete
	 */
	async waitForApiResponse(urlPattern: string | RegExp) {
		return this.page.waitForResponse(urlPattern);
	}

	/**
	 * Check if element exists (without throwing if not found)
	 */
	async elementExists(selector: string): Promise<boolean> {
		return (await this.page.$(selector)) !== null;
	}
}

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
	 * Check if current URL matches expected path
	 */
	async expectUrl(expectedPath: string) {
		await expect(this.page).toHaveURL(new RegExp(expectedPath));
	}

	/**
	 * Wait for element to be visible with retry logic
	 */
	async waitForVisible(locator: Locator, timeoutMs: number = 15000) {
		await expect(locator).toBeVisible({ timeout: timeoutMs });
	}

	/**
	 * Wait for the app to *settle* before asserting page content.
	 *
	 * Most e2e flake came from page-load waits racing a fixed visibility timeout:
	 * on a slow/variable CI runner the content occasionally rendered a beat after
	 * the budget expired. Instead of just enlarging the number, settle on the app's
	 * own signals first -- let in-flight requests finish and wait out the loading
	 * spinner -- *then* assert the content. The waits are best-effort (a runner can
	 * legitimately never reach networkidle); the final visibility check is the one
	 * that actually gates the result.
	 */
	async waitForContentReady(contentLocator: Locator, timeoutMs: number = 15000) {
		// Let pending navigation/data requests settle. Don't fail hard if the page
		// never fully idles -- the spinner + content checks below are the real signal.
		await this.page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});

		// If the app's loading spinner is up, wait for it to clear: that's the
		// signal the page has actually finished rendering, not just navigated.
		const loadingSpinner = this.page.locator('.animate-spin').first();
		if (await loadingSpinner.isVisible().catch(() => false)) {
			await loadingSpinner.waitFor({ state: 'hidden', timeout: timeoutMs }).catch(() => {});
		}

		await expect(contentLocator).toBeVisible({ timeout: timeoutMs });
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
	 * Check if element exists (without throwing if not found)
	 */
	async elementExists(selector: string): Promise<boolean> {
		return (await this.page.$(selector)) !== null;
	}
}

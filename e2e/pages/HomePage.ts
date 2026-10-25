import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
	readonly pageTitle: Locator;
	readonly newDocumentButton: Locator;
	readonly quickSwitcher: Locator;
	readonly quickSwitcherInput: Locator;
	readonly quickSwitcherResults: Locator;

	constructor(page: Page) {
		super(page);

		this.pageTitle = page.locator('h1').first();
		// The root folder view's "New Document" button
		this.newDocumentButton = page.getByTestId('create-document');
		this.quickSwitcher = page.getByTestId('quick-switcher');
		this.quickSwitcherInput = page.getByTestId('quick-switcher-input');
		this.quickSwitcherResults = page.getByTestId('quick-switcher-result');
	}

	async navigate() {
		await this.goto('/');
		await this.waitForLoad();
	}

	async verifyLoaded() {
		await this.waitForContentReady(this.pageTitle);
	}

	async createNewDocument() {
		await this.newDocumentButton.click();
		await this.page.waitForURL(/\/new/);
	}

	/** Open the quick switcher with its nav button and wait for the focused input. */
	async openQuickSwitcher() {
		await this.page.getByTestId('quick-switcher-button').click();
		await expect(this.quickSwitcher).toBeVisible();
		await expect(this.quickSwitcherInput).toBeFocused();
	}

	async search(query: string) {
		// The shortcut handler accepts Ctrl or Cmd, so Control+k works everywhere.
		await this.page.keyboard.press('Control+k');
		await expect(this.quickSwitcherInput).toBeVisible();
		await this.quickSwitcherInput.fill(query);
	}

	async clickSearchResult(resultText: string) {
		const result = this.quickSwitcherResults.filter({ hasText: resultText });
		await result.first().click();
	}
}

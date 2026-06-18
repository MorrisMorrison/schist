import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
	readonly pageTitle: Locator;
	readonly newPageButton: Locator;
	readonly quickSwitcherButton: Locator;
	readonly quickSwitcherInput: Locator;
	readonly quickSwitcherResults: Locator;
	readonly sidebar: Locator;

	constructor(page: Page) {
		super(page);

		this.pageTitle = page.getByTestId('page-title').or(page.locator('h1').first());
		this.newPageButton = page
			.getByTestId('new-page-button')
			.or(page.getByRole('link', { name: /Create.*First.*Page|Create.*Page/i }).first());
		this.quickSwitcherButton = page
			.getByTestId('quick-switcher-button')
			.or(page.getByTestId('quick-switcher-button-mobile'));
		this.quickSwitcherInput = page
			.getByTestId('quick-switcher-input')
			.or(page.getByPlaceholder('Search documents...'));
		this.quickSwitcherResults = page
			.getByTestId('quick-switcher-results')
			.or(page.locator('[role="dialog"] button'));
		this.sidebar = page.getByTestId('sidebar');
	}

	async navigate() {
		await this.goto('/');
		await this.waitForLoad();
	}

	async verifyLoaded() {
		await this.waitForVisible(this.pageTitle);
		await expect(this.pageTitle).toBeVisible();
	}

	async createNewPage() {
		await this.newPageButton.click();
		await this.page.waitForURL('/new');
	}

	async search(query: string) {
		await this.page.keyboard.press('Control+k');

		if (!(await this.quickSwitcherInput.isVisible())) {
			await this.page.keyboard.press('Meta+k');
		}

		await this.quickSwitcherInput.waitFor({ state: 'visible' });
		await this.quickSwitcherInput.fill(query);

		await this.quickSwitcherResults
			.first()
			.waitFor({ state: 'visible', timeout: 3000 })
			.catch(() => {
				// Search may not have results, which is fine
			});
	}

	async clickSearchResult(resultText: string) {
		const result = this.quickSwitcherResults.getByText(resultText);
		await result.click();
	}
}

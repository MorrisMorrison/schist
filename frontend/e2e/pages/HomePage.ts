import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
	readonly pageTitle: Locator;
	readonly newPageButton: Locator;
	readonly quickSwitcherButton: Locator;
	readonly quickSwitcherInput: Locator;
	readonly quickSwitcherResults: Locator;
	readonly recentPages: Locator;
	readonly sidebar: Locator;
	readonly navigation: Locator;

	constructor(page: Page) {
		super(page);

		this.pageTitle = page.locator('h1').first();
		this.newPageButton = page
			.getByRole('link', { name: /Create.*First.*Page|Create.*Page/i })
			.first();
		this.quickSwitcherButton = page
			.getByTestId('quick-switcher-button')
			.or(page.getByTestId('quick-switcher-button-mobile'));
		this.quickSwitcherInput = page.getByPlaceholder('Search documents...');
		this.quickSwitcherResults = page.locator('[role="dialog"] button');
		this.recentPages = page.getByTestId('recent-pages');
		this.sidebar = page.getByTestId('sidebar');
		this.navigation = page.locator('nav');
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
		await this.page.waitForTimeout(100);

		if (!(await this.quickSwitcherInput.isVisible())) {
			await this.page.keyboard.press('Meta+k');
			await this.page.waitForTimeout(100);
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

	async goToPages() {
		const pagesLink = this.navigation.getByRole('link', { name: /documents/i });
		await pagesLink.click();
		await this.page.waitForURL('/pages');
	}

	async goToFolders() {
		const foldersLink = this.navigation.getByRole('link', { name: /folders/i });
		await foldersLink.click();
		await this.page.waitForURL('/folders');
	}

	async hasRecentPages(): Promise<boolean> {
		return await this.elementExists('[data-testid="recent-pages"]');
	}

	async getRecentPageTitles(): Promise<string[]> {
		const pageLinks = this.recentPages.locator('a');
		return await pageLinks.allTextContents();
	}

	async clickRecentPage(pageTitle: string) {
		const pageLink = this.recentPages.getByRole('link', { name: pageTitle });
		await pageLink.click();
	}

	async toggleSidebar() {
		const sidebarToggle = this.page.getByRole('button', { name: /toggle sidebar|menu/i });
		if (await sidebarToggle.isVisible()) {
			await sidebarToggle.click();
		}
	}

	async verifySearchWorks(searchTerm: string, expectedResult: string) {
		await this.search(searchTerm);

		await this.waitForVisible(this.quickSwitcherResults.first());

		const result = this.quickSwitcherResults.getByText(expectedResult);
		await expect(result).toBeVisible();
	}
}

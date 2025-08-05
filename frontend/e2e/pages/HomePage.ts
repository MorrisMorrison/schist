import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for the home/landing page
 */
export class HomePage extends BasePage {
	// Locators
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

		// Initialize locators
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

	/**
	 * Navigate to home page
	 */
	async navigate() {
		await this.goto('/');
		await this.waitForLoad();
	}

	/**
	 * Verify home page is loaded correctly
	 */
	async verifyLoaded() {
		await this.waitForVisible(this.pageTitle);
		await expect(this.pageTitle).toBeVisible();
	}

	/**
	 * Click new page button and navigate to editor
	 */
	async createNewPage() {
		await this.newPageButton.click();
		await this.page.waitForURL('/new');
	}

	/**
	 * Search for content using Quick Switcher
	 */
	async search(query: string) {
		// Use keyboard shortcut to open Quick Switcher (works on all screen sizes)
		// Try Ctrl+k first (for most platforms), then Meta+k (Mac)
		await this.page.keyboard.press('Control+k');
		await this.page.waitForTimeout(100);

		// If that didn't work, try Meta+k
		if (!(await this.quickSwitcherInput.isVisible())) {
			await this.page.keyboard.press('Meta+k');
			await this.page.waitForTimeout(100);
		}

		// Wait for input to be visible and type search query
		await this.quickSwitcherInput.waitFor({ state: 'visible' });
		await this.quickSwitcherInput.fill(query);

		// Wait for search results to appear (with timeout)
		await this.quickSwitcherResults
			.first()
			.waitFor({ state: 'visible', timeout: 3000 })
			.catch(() => {
				// Search may not have results, which is fine
			});
	}

	/**
	 * Click on a search result
	 */
	async clickSearchResult(resultText: string) {
		const result = this.quickSwitcherResults.getByText(resultText);
		await result.click();
	}

	/**
	 * Navigate to pages section
	 */
	async goToPages() {
		const pagesLink = this.navigation.getByRole('link', { name: /documents/i });
		await pagesLink.click();
		await this.page.waitForURL('/pages');
	}

	/**
	 * Navigate to folders section
	 */
	async goToFolders() {
		const foldersLink = this.navigation.getByRole('link', { name: /folders/i });
		await foldersLink.click();
		await this.page.waitForURL('/folders');
	}

	/**
	 * Check if recent pages are displayed
	 */
	async hasRecentPages(): Promise<boolean> {
		return await this.elementExists('[data-testid="recent-pages"]');
	}

	/**
	 * Get list of recent page titles
	 */
	async getRecentPageTitles(): Promise<string[]> {
		const pageLinks = this.recentPages.locator('a');
		return await pageLinks.allTextContents();
	}

	/**
	 * Click on a recent page
	 */
	async clickRecentPage(pageTitle: string) {
		const pageLink = this.recentPages.getByRole('link', { name: pageTitle });
		await pageLink.click();
	}

	/**
	 * Toggle sidebar (if applicable)
	 */
	async toggleSidebar() {
		const sidebarToggle = this.page.getByRole('button', { name: /toggle sidebar|menu/i });
		if (await sidebarToggle.isVisible()) {
			await sidebarToggle.click();
		}
	}

	/**
	 * Verify search functionality works
	 */
	async verifySearchWorks(searchTerm: string, expectedResult: string) {
		await this.search(searchTerm);

		// Wait for search results
		await this.waitForVisible(this.quickSwitcherResults.first());

		// Verify expected result appears
		const result = this.quickSwitcherResults.getByText(expectedResult);
		await expect(result).toBeVisible();
	}
}

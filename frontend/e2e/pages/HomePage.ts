import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for the home/landing page
 */
export class HomePage extends BasePage {
	// Locators
	readonly pageTitle: Locator;
	readonly newPageButton: Locator;
	readonly searchBox: Locator;
	readonly searchResults: Locator;
	readonly recentPages: Locator;
	readonly sidebar: Locator;
	readonly navigation: Locator;

	constructor(page: Page) {
		super(page);

		// Initialize locators
		this.pageTitle = page.locator('h1').first();
		this.newPageButton = page.getByRole('button', { name: 'New Page' }).first();
		this.searchBox = page.getByPlaceholder(/search/i);
		this.searchResults = page.locator('[data-testid="search-results"]');
		this.recentPages = page.locator('[data-testid="recent-pages"]');
		this.sidebar = page.locator('[data-testid="sidebar"]');
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
	 * Search for content
	 */
	async search(query: string) {
		await this.searchBox.fill(query);
		// Wait for search results to appear
		await this.page.waitForTimeout(500); // Debounce delay
	}

	/**
	 * Click on a search result
	 */
	async clickSearchResult(resultText: string) {
		const result = this.searchResults.getByText(resultText);
		await result.click();
	}

	/**
	 * Navigate to pages section
	 */
	async goToPages() {
		const pagesLink = this.navigation.getByRole('link', { name: /pages/i });
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
		await this.waitForVisible(this.searchResults);

		// Verify expected result appears
		const result = this.searchResults.getByText(expectedResult);
		await expect(result).toBeVisible();
	}
}

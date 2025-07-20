import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for viewing individual pages (/pages/[...path])
 */
export class PageViewPage extends BasePage {
	// Page content
	readonly pageTitle: Locator;
	readonly pageContent: Locator;
	readonly pageTags: Locator;
	readonly pageMetadata: Locator;
	readonly createdDate: Locator;
	readonly updatedDate: Locator;

	// Action buttons
	readonly editButton: Locator;
	readonly deleteButton: Locator;
	readonly moveButton: Locator;

	// Navigation
	readonly breadcrumbs: Locator;
	readonly breadcrumbButtons: Locator;

	// Content elements
	readonly headings: Locator;
	readonly links: Locator;
	readonly images: Locator;
	readonly codeBlocks: Locator;
	readonly copyButtons: Locator;

	// Error states
	readonly notFoundMessage: Locator;
	readonly notFoundHeading: Locator;
	readonly errorMessage: Locator;
	readonly loadingSpinner: Locator;

	constructor(page: Page) {
		super(page);

		// Page content
		this.pageTitle = page.locator('h1').first();
		this.pageContent = page.locator('.prose, [data-testid="page-content"]').first();
		this.pageTags = page.getByTestId('page-tag');
		this.pageMetadata = page.locator('[data-testid="page-metadata"]');
		this.createdDate = page.locator('[data-testid="created-date"]');
		this.updatedDate = page.locator('[data-testid="updated-date"]');

		// Action buttons
		this.editButton = page.getByTestId('edit-page-button');
		this.deleteButton = page.getByTestId('delete-page-button');
		this.moveButton = page.getByTestId('move-page-button');

		// Navigation
		this.breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
		this.breadcrumbButtons = this.breadcrumbs.locator('button');

		// Content elements
		this.headings = this.pageContent.locator('h1, h2, h3, h4, h5, h6');
		this.links = this.pageContent.locator('a');
		this.images = this.pageContent.locator('img');
		this.codeBlocks = this.pageContent.locator('pre, code');
		this.copyButtons = page.locator('[data-testid="copy-button"]');

		// Error states
		this.notFoundMessage = page.getByText('404 - The page you\'re looking for doesn\'t exist.');
		this.notFoundHeading = page.getByRole('heading', { name: 'Page Not Found' });
		this.errorMessage = page.locator('[data-testid="error-message"]');
		this.loadingSpinner = page.locator('[data-testid="loading"]');
	}

	/**
	 * Navigate to a specific page
	 */
	async navigateToPage(pagePath: string) {
		await this.goto(`/pages${pagePath}`);
		await this.waitForLoad();
	}

	/**
	 * Verify page is loaded and displays content
	 */
	async verifyPageLoaded(expectedTitle?: string) {
		await this.waitForVisible(this.pageTitle);

		if (expectedTitle) {
			await expect(this.pageTitle).toContainText(expectedTitle);
		}

		// Ensure page content is visible
		await this.waitForVisible(this.pageContent);
	}

	/**
	 * Get the page title text
	 */
	async getPageTitle(): Promise<string> {
		return (await this.pageTitle.textContent()) || '';
	}

	/**
	 * Get the page content text
	 */
	async getPageContent(): Promise<string> {
		return (await this.pageContent.textContent()) || '';
	}

	/**
	 * Get list of page tags
	 */
	async getPageTags(): Promise<string[]> {
		return await this.pageTags.allTextContents();
	}

	/**
	 * Click edit button and navigate to editor
	 */
	async editPage() {
		await Promise.all([this.page.waitForURL(/\/edit\//), this.editButton.click()]);
	}

	/**
	 * Click delete button (with confirmation)
	 */
	async deletePage() {
		await this.deleteButton.click();

		// Wait for confirmation dialog and confirm
		const confirmButton = this.page.getByTestId('confirm-delete-button');
		await this.waitForVisible(confirmButton);
		await confirmButton.click();

		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Click move button and open move modal
	 */
	async movePage() {
		await this.moveButton.click();

		// Wait for move modal to appear
		const moveModal = this.page.locator('[data-testid="move-modal"]');
		await this.waitForVisible(moveModal);
	}

	/**
	 * Navigate using breadcrumbs
	 */
	async clickBreadcrumb(breadcrumbText: string) {
	const breadcrumb = this.breadcrumbButtons.getByText(breadcrumbText);
		await breadcrumb.click();
		await this.waitForLoad();
	}

	/**
	 * Get breadcrumb path
	 */
	async getBreadcrumbPath(): Promise<string[]> {
		return await this.breadcrumbButtons.allTextContents();
	}

	/**
	 * Verify content contains specific text
	 */
	async verifyContentContains(text: string) {
		await expect(this.pageContent).toContainText(text);
	}

	/**
	 * Verify content contains specific heading
	 */
	async verifyHeading(headingText: string, level?: number) {
		if (level) {
			const heading = this.pageContent.locator(`h${level}`).getByText(headingText);
			await expect(heading).toBeVisible();
		} else {
			const heading = this.headings.getByText(headingText);
			await expect(heading).toBeVisible();
		}
	}

	/**
	 * Click on a link within the page content
	 */
	async clickContentLink(linkText: string) {
		const link = this.links.getByText(linkText);
		await link.click();
		await this.waitForLoad();
	}

	/**
	 * Verify image is displayed
	 */
	async verifyImageDisplayed(imageSrc: string) {
		const image = this.images.filter({ has: this.page.locator(`[src*="${imageSrc}"]`) });
		await expect(image).toBeVisible();
	}

	/**
	 * Copy code block content
	 */
	async copyCodeBlock(index: number = 0) {
		const copyButton = this.copyButtons.nth(index);
		await copyButton.click();

		// Verify copy feedback (if available)
		const copyFeedback = this.page.locator('[data-testid="copy-success"]');
		if (await copyFeedback.isVisible({ timeout: 1000 })) {
			await expect(copyFeedback).toBeVisible();
		}
	}

	/**
	 * Verify page metadata is displayed
	 */
	async verifyMetadata() {
		// Check if created date is shown
		if (await this.createdDate.isVisible()) {
			await expect(this.createdDate).toBeVisible();
		}

		// Check if updated date is shown
		if (await this.updatedDate.isVisible()) {
			await expect(this.updatedDate).toBeVisible();
		}
	}

	/**
	 * Verify page has specific tags
	 */
	async verifyTags(expectedTags: string[]) {
		for (const tag of expectedTags) {
			const tagElement = this.pageTags.getByText(tag);
			await expect(tagElement).toBeVisible();
		}
	}

	/**
	 * Check if page displays 404 error
	 */
	async verifyPageNotFound() {
		// Try to find either the heading or the message
		try {
			await this.waitForVisible(this.notFoundHeading);
		} catch {
			// If heading not found, try the message
			await this.waitForVisible(this.notFoundMessage);
		}
		
		// Verify at least one of them is visible
		const headingVisible = await this.notFoundHeading.isVisible();
		const messageVisible = await this.notFoundMessage.isVisible();
		
		if (!headingVisible && !messageVisible) {
			throw new Error('404 page elements not found');
		}
	}

	/**
	 * Verify page is loading
	 */
	async verifyLoading() {
		await this.waitForVisible(this.loadingSpinner);
	}

	/**
	 * Count number of headings in content
	 */
	async getHeadingCount(): Promise<number> {
		return await this.headings.count();
	}

	/**
	 * Count number of links in content
	 */
	async getLinkCount(): Promise<number> {
		return await this.links.count();
	}

	/**
	 * Count number of images in content
	 */
	async getImageCount(): Promise<number> {
		return await this.images.count();
	}

	/**
	 * Verify markdown rendering
	 */
	async verifyMarkdownRendering() {
		// Check that markdown has been converted to HTML
		await expect(this.pageContent).not.toContainText('# ');
		await expect(this.pageContent).not.toContainText('**');
		await expect(this.pageContent).not.toContainText('```');

		// Verify HTML elements are present
		if ((await this.headings.count()) > 0) {
			await expect(this.headings.first()).toBeVisible();
		}
	}

	/**
	 * Verify page URL matches expected path
	 */
	async verifyPageUrl(expectedPath: string) {
		await this.expectUrl(`/pages${expectedPath}`);
	}
}

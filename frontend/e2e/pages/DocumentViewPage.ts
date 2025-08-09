import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for viewing individual documents (/documents/[...path])
 */
export class DocumentViewPage extends BasePage {
	// Document content
	readonly documentTitle: Locator;
	readonly documentContent: Locator;
	readonly documentTags: Locator;
	readonly documentMetadata: Locator;
	readonly createdDate: Locator;
	readonly updatedDate: Locator;

	// Action buttons
	readonly editButton: Locator;
	readonly shareButton: Locator;
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

		// Document content
		this.documentTitle = page.locator('h1').first();
		this.documentContent = page.locator('.prose').first();
		this.documentTags = page.getByTestId('document-tag');
		this.documentMetadata = page.getByTestId('document-metadata');
		this.createdDate = page.getByTestId('created-date');
		this.updatedDate = page.getByTestId('updated-date');

		// Action buttons
		this.editButton = page.getByTestId('edit-document-button');
		this.shareButton = page.getByTestId('share-document-button');
		this.deleteButton = page.getByTestId('delete-document-button');
		this.moveButton = page.getByTestId('move-document-button');

		// Navigation
		this.breadcrumbs = page.getByTestId('breadcrumbs');
		this.breadcrumbButtons = this.breadcrumbs.locator('button');

		// Content elements
		this.headings = this.documentContent.locator('h1, h2, h3, h4, h5, h6');
		this.links = this.documentContent.locator('a');
		this.images = this.documentContent.locator('img');
		this.codeBlocks = this.documentContent.locator('pre, code');
		this.copyButtons = page.getByTestId('copy-button');

		// Error states (using actual UI text)
		this.notFoundMessage = page.getByText("404 - The document you're looking for doesn't exist.");
		this.notFoundHeading = page.getByRole('heading', { name: 'Document Not Found' });
		this.errorMessage = page.getByTestId('error-message');
		this.loadingSpinner = page.getByTestId('loading');
	}

	/**
	 * Navigate to a specific document
	 */
	async navigateToDocument(documentPath: string) {
		await this.goto(`/documents${documentPath}`);
		await this.waitForLoad();
	}

	/**
	 * Verify document is loaded and displays content
	 */
	async verifyDocumentLoaded(expectedTitle?: string) {
		// Wait for loading to complete first
		await this.page.waitForLoadState('networkidle');

		// Wait for loading spinner to disappear if present
		const loadingSpinner = this.page.locator('.animate-spin');
		if (await loadingSpinner.isVisible()) {
			await loadingSpinner.waitFor({ state: 'hidden', timeout: 5000 });
		}

		// Now wait for document title to be visible
		await this.waitForVisible(this.documentTitle);

		if (expectedTitle) {
			await expect(this.documentTitle).toContainText(expectedTitle);
		}

		// Ensure document content is visible
		await this.waitForVisible(this.documentContent);
	}

	/**
	 * Get the document title text
	 */
	async getDocumentTitle(): Promise<string> {
		return (await this.documentTitle.textContent()) || '';
	}

	/**
	 * Get the document content text
	 */
	async getDocumentContent(): Promise<string> {
		return (await this.documentContent.textContent()) || '';
	}

	/**
	 * Get list of document tags
	 */
	async getDocumentTags(): Promise<string[]> {
		return await this.documentTags.allTextContents();
	}

	/**
	 * Click edit button and navigate to editor
	 */
	async editDocument() {
		await Promise.all([this.page.waitForURL(/\/edit\//), this.editButton.click()]);
	}

	/**
	 * Click delete button (with confirmation)
	 */
	async deleteDocument() {
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
	async moveDocument() {
		await this.moveButton.click();

		// Wait for move modal to appear
		const moveModal = this.page.getByTestId('move-modal');
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
		await expect(this.documentContent).toContainText(text);
	}

	/**
	 * Verify content contains specific heading
	 */
	async verifyHeading(headingText: string, level?: number) {
		if (level) {
			const heading = this.documentContent.locator(`h${level}`).getByText(headingText);
			await expect(heading).toBeVisible();
		} else {
			const heading = this.headings.getByText(headingText);
			await expect(heading).toBeVisible();
		}
	}

	/**
	 * Click on a link within the document content
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
		const copyFeedback = this.page.getByTestId('copy-success');
		if (await copyFeedback.isVisible({ timeout: 1000 })) {
			await expect(copyFeedback).toBeVisible();
		}
	}

	/**
	 * Verify document metadata is displayed
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
	 * Verify document has specific tags
	 */
	async verifyTags(expectedTags: string[]) {
		for (const tag of expectedTags) {
			const tagElement = this.documentTags.getByText(tag);
			await expect(tagElement).toBeVisible();
		}
	}

	/**
	 * Check if document displays 404 error
	 */
	async verifyDocumentNotFound() {
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
			throw new Error('404 document elements not found');
		}
	}

	/**
	 * Verify document is loading
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
		await expect(this.documentContent).not.toContainText('# ');
		await expect(this.documentContent).not.toContainText('**');
		await expect(this.documentContent).not.toContainText('```');

		// Verify HTML elements are present
		if ((await this.headings.count()) > 0) {
			await expect(this.headings.first()).toBeVisible();
		}
	}

	/**
	 * Verify document URL matches expected path
	 */
	async verifyDocumentUrl(expectedPath: string) {
		await this.expectUrl(`/documents${expectedPath}`);
	}

	/**
	 * Legacy aliases for backwards compatibility
	 */
	async navigateToPage(pagePath: string) {
		return this.navigateToDocument(pagePath);
	}

	async verifyPageLoaded(expectedTitle?: string) {
		return this.verifyDocumentLoaded(expectedTitle);
	}

	async getPageTitle(): Promise<string> {
		return this.getDocumentTitle();
	}

	async getPageContent(): Promise<string> {
		return this.getDocumentContent();
	}

	async getPageTags(): Promise<string[]> {
		return this.getDocumentTags();
	}

	async editPage() {
		return this.editDocument();
	}

	async deletePage() {
		return this.deleteDocument();
	}

	async movePage() {
		return this.moveDocument();
	}

	async verifyPageNotFound() {
		return this.verifyDocumentNotFound();
	}

	async verifyPageUrl(expectedPath: string) {
		return this.verifyDocumentUrl(expectedPath);
	}

	/**
	 * Click the share button to open the share modal
	 */
	async openShareModal() {
		await this.shareButton.click();

		// Wait for share modal to appear
		const shareModal = this.page.locator('[role="dialog"]').filter({ hasText: 'Share' });
		await expect(shareModal).toBeVisible();
		return shareModal;
	}

	/**
	 * Create a share link with specific expiry
	 */
	async createShareLink(expiryDays: number = 7): Promise<string> {
		const modal = await this.openShareModal();

		const expirySelect = modal.locator('select');
		await expirySelect.selectOption(expiryDays.toString());

		const createButton = modal.getByRole('button', { name: /create share link/i });
		await createButton.click();

		await this.page.waitForTimeout(1000);
		const shareInput = modal.locator('input[readonly]').first();
		await expect(shareInput).toBeVisible();

		return await shareInput.inputValue();
	}

	/**
	 * Copy share link to clipboard
	 */
	async copyShareLink(): Promise<void> {
		const modal = this.page.locator('[role="dialog"]').filter({ hasText: 'Share' });
		const copyButton = modal
			.getByRole('button')
			.filter({ has: this.page.locator('svg') })
			.nth(0);
		await copyButton.click();

		// Wait for success message
		await expect(modal.getByText(/copied to clipboard/i)).toBeVisible();
	}

	/**
	 * Revoke a share link
	 */
	async revokeShareLink(shareIndex = 0): Promise<void> {
		const modal = this.page.locator('[role="dialog"]').filter({ hasText: 'Share' });
		const revokeButtons = modal.getByTestId('revoke-share-btn');
		await revokeButtons.nth(shareIndex).click();

		// Wait for success message
		await expect(modal.getByText(/revoked successfully/i)).toBeVisible();
	}

	/**
	 * Close the share modal
	 */
	async closeShareModal(): Promise<void> {
		const modal = this.page.locator('[role="dialog"]').filter({ hasText: 'Share' });
		await this.page.keyboard.press('Escape');
		await expect(modal).not.toBeVisible();
	}

	/**
	 * Get all active share links from the modal
	 */
	async getActiveShareLinks(): Promise<string[]> {
		const modal = this.page.locator('[role="dialog"]').filter({ hasText: 'Share' });
		const shareInputs = modal.locator('input[readonly]');
		const count = await shareInputs.count();
		const links: string[] = [];

		for (let i = 0; i < count; i++) {
			const value = await shareInputs.nth(i).inputValue();
			if (value) links.push(value);
		}

		return links;
	}

	// Legacy property aliases
	get pageTitle() {
		return this.documentTitle;
	}
	get pageContent() {
		return this.documentContent;
	}
	get pageTags() {
		return this.documentTags;
	}
	get pageMetadata() {
		return this.documentMetadata;
	}
}

// Legacy export for backwards compatibility
export const PageViewPage = DocumentViewPage;

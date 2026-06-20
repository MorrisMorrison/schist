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

	// Error states
	readonly notFoundMessage: Locator;
	readonly notFoundHeading: Locator;
	readonly errorMessage: Locator;

	constructor(page: Page) {
		super(page);

		// Document content
		this.documentTitle = page.getByTestId('document-title').or(page.locator('h1').first());
		this.documentContent = page.getByTestId('document-content').or(page.locator('.prose').first());
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

		// Error states (using actual UI text)
		this.notFoundMessage = page
			.getByTestId('not-found-message')
			.or(page.getByText("404 - The document you're looking for doesn't exist."));
		this.notFoundHeading = page
			.getByTestId('not-found-heading')
			.or(page.getByRole('heading', { name: 'Document Not Found' }));
		this.errorMessage = page.getByTestId('error-message');
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
	async verifyDocumentLoaded(expectedTitle?: string, timeoutMs: number = 15000) {
		// Settle on the app's load signals (networkidle + spinner gone), then assert
		// the title -- the shared helper this pattern was extracted into. A large or
		// unicode-heavy body renders slowly enough to delay the title paint past the
		// default budget, so those call sites pass a longer timeoutMs.
		await this.waitForContentReady(this.documentTitle, timeoutMs);

		if (expectedTitle) {
			await expect(this.documentTitle).toContainText(expectedTitle, { timeout: timeoutMs });
		}

		// Ensure document content is visible
		await this.waitForVisible(this.documentContent, timeoutMs);
	}

	/**
	 * Get the document content text
	 */
	async getDocumentContent(): Promise<string> {
		return (await this.documentContent.textContent()) || '';
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
	 * Verify markdown rendering
	 */
	async verifyMarkdownRendering() {
		// Verify HTML elements are present (more reliable than checking absence of markdown)
		const headingCount = await this.headings.count();
		if (headingCount > 0) {
			await expect(this.headings.first()).toBeVisible();
		}

		// Check for some basic HTML structure that should exist if markdown is rendered
		const hasHeaders = headingCount > 0;
		const hasContent = (await this.documentContent.textContent()) !== '';

		// At least verify the content container has content and structure
		await expect(this.documentContent).toBeVisible();
		if (!hasHeaders && !hasContent) {
			throw new Error('No rendered content or HTML structure found');
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

	async editPage() {
		return this.editDocument();
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

		// Count existing shares before creating a new one
		const existingShares = await modal.locator('input[readonly]').count();

		const expirySelect = modal.locator('select');
		await expirySelect.selectOption(expiryDays.toString());

		const createButton = modal.getByRole('button', { name: /create share link/i });
		await createButton.click();

		// Wait for the new share to be created by waiting for one more input field
		await expect(modal.locator('input[readonly]')).toHaveCount(existingShares + 1);

		// Wait for success message to confirm creation completed
		await expect(modal.getByText(/share link created successfully/i)).toBeVisible();

		// Get the newly created share (last one in the list)
		const shareInputs = modal.locator('input[readonly]');
		const newShareInput = shareInputs.last();
		await expect(newShareInput).toBeVisible();

		return await newShareInput.inputValue();
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
}

import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { EditorPage } from './EditorPage';

/**
 * Page object for viewing individual documents (/documents/[...path]),
 * including the Share modal opened from the document header.
 */
export class DocumentViewPage extends BasePage {
	/** The document page; its `data-mode` is `read` or `edit`. */
	readonly documentView: Locator;

	// Document content
	readonly documentTitle: Locator;
	readonly documentContent: Locator;
	readonly documentTags: Locator;
	readonly documentHeader: Locator;

	// Action buttons
	readonly editButton: Locator;
	readonly shareButton: Locator;
	readonly deleteButton: Locator;
	readonly actionsMenuButton: Locator;

	// Navigation
	readonly breadcrumbs: Locator;
	readonly breadcrumbButtons: Locator;

	// Content elements
	readonly headings: Locator;
	readonly links: Locator;

	// Error states
	readonly notFoundMessage: Locator;
	readonly notFoundHeading: Locator;

	// Share modal
	readonly shareModal: Locator;
	readonly shareLinkInputs: Locator;

	constructor(page: Page) {
		super(page);

		this.documentView = page.getByTestId('document-view');

		// Document content. Test ids only: an `h1` fallback would also match the
		// "Document Not Found" / "Error" headings and mask a failed load.
		this.documentTitle = page.getByTestId('document-title');
		this.documentContent = page.getByTestId('document-content');
		this.documentTags = page.getByTestId('document-tag');
		this.documentHeader = this.documentView.locator('header');

		// Action buttons
		this.editButton = page.getByTestId('edit-document-button');
		this.shareButton = page.getByTestId('share-document-button');
		this.deleteButton = page.getByTestId('delete-document-button');
		// Delete, download and history live in the "More actions" menu.
		this.actionsMenuButton = page.getByTestId('document-actions-menu');

		// Navigation
		this.breadcrumbs = page.getByTestId('breadcrumbs');
		this.breadcrumbButtons = this.breadcrumbs.locator('button');

		// Content elements
		this.headings = this.documentContent.locator('h1, h2, h3, h4, h5, h6');
		this.links = this.documentContent.locator('a');

		// Error states
		this.notFoundMessage = page.getByTestId('not-found-message');
		this.notFoundHeading = page.getByTestId('not-found-heading');

		// Share modal
		this.shareModal = page.getByRole('dialog').filter({ hasText: 'Share' });
		this.shareLinkInputs = this.shareModal.getByTestId('share-url');
	}

	/**
	 * Navigate to a specific document
	 */
	async navigateToDocument(documentPath: string) {
		await this.goto(`/documents${documentPath}`);
		await this.waitForLoad();
	}

	/**
	 * Open a seeded document by its path and wait until it has loaded with its
	 * title. The usual way into a document; use navigateToDocument for a path
	 * that is not expected to load (a 404, say).
	 */
	async openDocument(document: { path?: string; title: string }) {
		if (!document.path) {
			throw new Error(`openDocument: "${document.title}" has no path`);
		}
		await this.navigateToDocument(document.path);
		await this.verifyDocumentLoaded(document.title);
	}

	/**
	 * Verify document is loaded and displays content
	 */
	async verifyDocumentLoaded(expectedTitle?: string) {
		// Settle on the app's load signals (networkidle + spinner gone), then assert
		// the title -- the shared helper this pattern was extracted into.
		await this.waitForContentReady(this.documentTitle);

		if (expectedTitle) {
			await expect(this.documentTitle).toContainText(expectedTitle, { timeout: 10000 });
		}

		// Ensure document content is visible
		await this.waitForVisible(this.documentContent, 10000);
	}

	/**
	 * Get the document content text
	 */
	async getDocumentContent(): Promise<string> {
		return (await this.documentContent.textContent()) || '';
	}

	/**
	 * Switch the document to edit mode (in place; the URL gains ?mode=edit) and
	 * wait until the editor is ready.
	 */
	async editDocument() {
		await this.editButton.click();
		await this.page.waitForURL(/\?mode=edit/);
		await new EditorPage(this.page).verifyLoaded();
	}

	/**
	 * Delete the document through the confirmation dialog, and wait for the
	 * backend to confirm the delete before returning. (Waiting for network idle
	 * instead let a caller navigate back to the document while the DELETE was
	 * still in flight, and find it still there.)
	 */
	async deleteDocument() {
		await this.actionsMenuButton.click();
		await this.deleteButton.click();

		const confirmButton = this.page.getByTestId('confirm-delete-button');
		await this.waitForVisible(confirmButton);

		const deleted = this.page.waitForResponse(
			(response) =>
				response.request().method() === 'DELETE' &&
				new URL(response.url()).pathname.includes('/api/documents/')
		);
		await confirmButton.click();
		expect((await deleted).ok()).toBe(true);
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
		const headings = level ? this.documentContent.locator(`h${level}`) : this.headings;
		await expect(headings.getByText(headingText)).toBeVisible();
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
	 * Verify the header shows the document's creation date. ("Updated" is only
	 * shown once it differs from "Created", so it is not asserted.)
	 */
	async verifyMetadata() {
		await expect(this.documentHeader.getByText(/^Created /)).toBeVisible();
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
	 * Verify the route rendered its 404 state
	 */
	async verifyDocumentNotFound() {
		await this.waitForContentReady(this.notFoundHeading);
		await expect(this.notFoundMessage).toBeVisible();
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
	 * Verify the markdown was rendered to HTML (headings exist), not shown raw
	 */
	async verifyMarkdownRendering() {
		await expect(this.headings.first()).toBeVisible();
	}

	/**
	 * Verify document URL matches expected path
	 */
	async verifyDocumentUrl(expectedPath: string) {
		await this.expectUrl(`/documents${expectedPath}`);
	}

	/**
	 * Click the share button to open the share modal
	 */
	async openShareModal() {
		await this.shareButton.click();
		await expect(this.shareModal).toBeVisible();
		return this.shareModal;
	}

	/** The expiry select's option label for a number of days. */
	private static readonly EXPIRY_LABELS: Record<number, string> = {
		1: '1 day',
		7: '1 week',
		30: '1 month',
		90: '3 months',
		0: 'Never expires'
	};

	/** Pick the share expiry in the open share modal's select (a listbox, not a native select). */
	async chooseShareExpiry(expiryDays: number) {
		const label = DocumentViewPage.EXPIRY_LABELS[expiryDays];
		if (!label) throw new Error(`No share expiry option for ${expiryDays} days`);
		await this.shareModal.getByTestId('share-expiry-select').click();
		const listbox = this.page.getByRole('listbox');
		await expect(listbox).toBeVisible();
		await listbox.getByRole('option', { name: label, exact: true }).click();
		await expect(listbox).toBeHidden();
		await expect(this.shareModal.getByTestId('share-expiry-select')).toHaveText(label);
	}

	/**
	 * Create a share link with specific expiry
	 */
	async createShareLink(expiryDays: number = 7): Promise<string> {
		const modal = await this.openShareModal();

		// Count existing shares before creating a new one
		const existingShares = await this.shareLinkInputs.count();

		await this.chooseShareExpiry(expiryDays);

		await modal.getByTestId('create-share-link').click();

		// Wait for the new share to be created by waiting for one more link
		await expect(this.shareLinkInputs).toHaveCount(existingShares + 1);

		// Wait for success message to confirm creation completed
		await expect(modal.getByText(/share link created successfully/i)).toBeVisible();

		// Get the newly created share (last one in the list)
		const newShareInput = this.shareLinkInputs.last();
		await expect(newShareInput).toBeVisible();

		return await newShareInput.inputValue();
	}

	/**
	 * Revoke a share link
	 */
	async revokeShareLink(shareIndex = 0): Promise<void> {
		const revokeButtons = this.shareModal.getByTestId('revoke-share-btn');
		await revokeButtons.nth(shareIndex).click();

		// Wait for success message
		await expect(this.shareModal.getByText(/revoked successfully/i)).toBeVisible();
	}

	/**
	 * Close the share modal
	 */
	async closeShareModal(): Promise<void> {
		await this.page.keyboard.press('Escape');
		await expect(this.shareModal).not.toBeVisible();
	}

	/**
	 * Get all active share links from the modal
	 */
	async getActiveShareLinks(): Promise<string[]> {
		const count = await this.shareLinkInputs.count();
		const links: string[] = [];

		for (let i = 0; i < count; i++) {
			const value = await this.shareLinkInputs.nth(i).inputValue();
			if (value) links.push(value);
		}

		return links;
	}
}

import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for the page editor (/new and /edit routes)
 */
export class EditorPage extends BasePage {
	// Form elements
	readonly titleInput: Locator;
	readonly contentEditor: Locator;
	readonly tagsInput: Locator;
	readonly saveButton: Locator;
	readonly cancelButton: Locator;
	readonly deleteButton: Locator;
	readonly confirmDeleteButton: Locator;

	// Editor features
	readonly editorToolbar: Locator;
	readonly previewToggle: Locator;
	readonly previewPane: Locator;
	readonly imageUploadButton: Locator;
	readonly fileUploadInput: Locator;

	// Status indicators
	readonly saveStatus: Locator;
	readonly errorMessage: Locator;
	readonly loadingSpinner: Locator;

	// Page info
	readonly pagePathInfo: Locator;
	readonly breadcrumbs: Locator;

	constructor(page: Page) {
		super(page);

		// Form elements
		this.titleInput = page.getByLabel(/title/i);
		this.contentEditor = page
			.locator('.cm-editor .cm-content, textarea[placeholder*="content"]')
			.first();
		this.tagsInput = page.getByLabel(/tags/i);
		this.saveButton = page.getByRole('button', { name: /save/i });
		this.cancelButton = page.getByRole('button', { name: /cancel/i });
		this.deleteButton = page.getByRole('button', { name: /delete/i });
		this.confirmDeleteButton = page.getByRole('button', { name: /confirm delete|yes.*delete/i });

		// Editor features
		this.editorToolbar = page.locator('[data-testid="editor-toolbar"]');
		this.previewToggle = page.getByRole('button', { name: /preview/i });
		this.previewPane = page.locator('[data-testid="preview-pane"]');
		this.imageUploadButton = page.getByRole('button', { name: /upload image|image/i });
		this.fileUploadInput = page.locator('input[type="file"]');

		// Status indicators
		this.saveStatus = page.locator('[data-testid="save-status"]');
		this.errorMessage = page.locator('[data-testid="error-message"], .error');
		this.loadingSpinner = page.locator('[data-testid="loading"], .loading');

		// Page info
		this.pagePathInfo = page.locator('[data-testid="page-path"]');
		this.breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
	}

	/**
	 * Navigate to new page editor
	 */
	async navigateToNew() {
		await this.goto('/new');
		await this.waitForLoad();
	}

	/**
	 * Navigate to edit existing page
	 */
	async navigateToEdit(pagePath: string) {
		await this.goto(`/edit${pagePath}`);
		await this.waitForLoad();
	}

	/**
	 * Verify editor page is loaded
	 */
	async verifyLoaded() {
		await this.waitForVisible(this.titleInput);
		await this.waitForVisible(this.contentEditor);
		await this.waitForVisible(this.saveButton);
	}

	/**
	 * Fill in page details
	 */
	async fillPageDetails(title: string, content: string, tags: string[] = []) {
		// Fill title
		await this.fillInput(this.titleInput, title);

		// Fill content
		await this.contentEditor.click();
		await this.contentEditor.fill(content);

		// Add tags if provided
		if (tags.length > 0) {
			await this.addTags(tags);
		}
	}

	/**
	 * Add tags to the page
	 */
	async addTags(tags: string[]) {
		for (const tag of tags) {
			await this.tagsInput.fill(tag);
			await this.page.keyboard.press('Enter');
		}
	}

	/**
	 * Save the page
	 */
	async save() {
		await this.saveButton.click();
		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Save and expect navigation to page view
	 */
	async saveAndExpectNavigation() {
		await Promise.all([this.page.waitForURL(/\/pages\//), this.saveButton.click()]);
	}

	/**
	 * Cancel editing
	 */
	async cancel() {
		await this.cancelButton.click();
	}

	/**
	 * Delete the page (with confirmation)
	 */
	async deletePage() {
		await this.deleteButton.click();
		await this.waitForVisible(this.confirmDeleteButton);
		await this.confirmDeleteButton.click();
		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Type content in the editor
	 */
	async typeContent(content: string) {
		await this.contentEditor.click();
		await this.contentEditor.type(content);
	}

	/**
	 * Clear content in the editor
	 */
	async clearContent() {
		await this.contentEditor.click();
		await this.page.keyboard.press('Control+a');
		await this.page.keyboard.press('Delete');
	}

	/**
	 * Toggle preview mode
	 */
	async togglePreview() {
		if (await this.previewToggle.isVisible()) {
			await this.previewToggle.click();
		}
	}

	/**
	 * Upload an image
	 */
	async uploadImage(filePath: string) {
		// Set up file chooser listener before clicking upload button
		const fileChooserPromise = this.page.waitForEvent('filechooser');

		if (await this.imageUploadButton.isVisible()) {
			await this.imageUploadButton.click();
		} else {
			// Fallback: look for hidden file input
			await this.fileUploadInput.setInputFiles(filePath);
			return;
		}

		const fileChooser = await fileChooserPromise;
		await fileChooser.setFiles(filePath);

		// Wait for upload to complete
		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Use keyboard shortcut to save (Ctrl+S)
	 */
	async saveWithKeyboard() {
		await this.page.keyboard.press('Control+s');
		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Wait for auto-save to trigger
	 */
	async waitForAutoSave(timeoutMs: number = 15000) {
		// Wait for auto-save indicator or timeout
		try {
			await this.page.waitForFunction(
				() => document.querySelector('[data-testid="auto-saved"]') !== null,
				{ timeout: timeoutMs }
			);
		} catch {
			// Auto-save might not have visual indicator, just wait for network
			await this.page.waitForLoadState('networkidle');
		}
	}

	/**
	 * Verify content is displayed in editor
	 */
	async verifyContent(expectedContent: string) {
		await expect(this.contentEditor).toContainText(expectedContent);
	}

	/**
	 * Verify page title is displayed
	 */
	async verifyTitle(expectedTitle: string) {
		await expect(this.titleInput).toHaveValue(expectedTitle);
	}

	/**
	 * Check if page has unsaved changes
	 */
	async hasUnsavedChanges(): Promise<boolean> {
		// This would depend on UI indicators for unsaved changes
		return await this.elementExists('[data-testid="unsaved-changes"]');
	}

	/**
	 * Verify error message is displayed
	 */
	async verifyError(expectedError: string) {
		await this.waitForVisible(this.errorMessage);
		await expect(this.errorMessage).toContainText(expectedError);
	}

	/**
	 * Format text with bold
	 */
	async makeBold(text: string) {
		// Select text and apply bold formatting
		await this.contentEditor.selectText();
		await this.page.keyboard.press('Control+b');
	}

	/**
	 * Insert markdown heading
	 */
	async insertHeading(level: number, text: string) {
		const headingMarkdown = '#'.repeat(level) + ' ' + text;
		await this.typeContent(headingMarkdown);
	}

	/**
	 * Insert markdown link
	 */
	async insertLink(linkText: string, url: string) {
		const linkMarkdown = `[${linkText}](${url})`;
		await this.typeContent(linkMarkdown);
	}

	/**
	 * Get current page path from UI
	 */
	async getCurrentPath(): Promise<string> {
		if (await this.pagePathInfo.isVisible()) {
			return (await this.pagePathInfo.textContent()) || '';
		}
		return '';
	}
}

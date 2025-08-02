import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for the document editor (/new and /edit routes)
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

	// Document info
	readonly documentPathInfo: Locator;
	readonly breadcrumbs: Locator;

	constructor(page: Page) {
		super(page);

		// Form elements (using legacy testids until UI is updated)
		this.titleInput = page.getByTestId('document-title-input');
		this.contentEditor = page
			.locator('.cm-editor .cm-content, textarea[placeholder*="content"]')
			.first();
		this.tagsInput = page.getByTestId('tags-input');
		this.saveButton = page.getByTestId('save-document-button');
		this.cancelButton = page.getByTestId('cancel-button');
		this.deleteButton = page.getByTestId('delete-document-button');
		this.confirmDeleteButton = page.getByTestId('confirm-delete-button');

		// Editor features
		this.editorToolbar = page.getByTestId('editor-toolbar');
		this.previewToggle = page.getByRole('button', { name: /preview/i });
		this.previewPane = page.getByTestId('preview-pane');
		this.imageUploadButton = page.getByRole('button', { name: /upload image|image/i });
		this.fileUploadInput = page.locator('input[type="file"]');

		// Status indicators
		this.saveStatus = page.getByTestId('save-status');
		this.errorMessage = page.locator('[data-testid="error-message"], .error');
		this.loadingSpinner = page.locator('[data-testid="loading"], .loading');

		// Document info (using legacy testid until UI is updated)
		this.documentPathInfo = page.getByTestId('document-path');
		this.breadcrumbs = page.getByTestId('breadcrumbs');
	}

	/**
	 * Navigate to new document editor
	 */
	async navigateToNew() {
		await this.goto('/new');
		await this.waitForLoad();
	}

	/**
	 * Navigate to edit existing document
	 */
	async navigateToEdit(documentPath: string) {
		await this.goto(`/edit${documentPath}`);
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
	 * Fill in document details
	 */
	async fillDocumentDetails(title: string, content: string, tags: string[] = []) {
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
	 * Add tags to the document
	 */
	async addTags(tags: string[]) {
		for (const tag of tags) {
			await this.tagsInput.clear();
			await this.tagsInput.fill(tag);
			await this.page.keyboard.press('Enter');
			// Wait for the tag to be added - check input is cleared after adding
			await expect(this.tagsInput).toHaveValue('');
		}
	}

	/**
	 * Save the document
	 */
	async save() {
		await this.saveButton.click();
		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Save and expect navigation to document view
	 */
	async saveAndExpectNavigation() {
		await Promise.all([
			this.page.waitForURL(/\/documents\//, { timeout: 5000 }),
			this.saveButton.click()
		]);
	}

	/**
	 * Cancel editing
	 */
	async cancel() {
		await this.cancelButton.click();
	}

	/**
	 * Delete the document (with confirmation)
	 */
	async deleteDocument() {
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
		await this.contentEditor.pressSequentially(content);
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
		// Auto-save happens after 10 seconds of no changes + network request time
		// First wait for unsaved indicator to appear (content was changed)
		try {
			await this.page.getByTestId('unsaved-indicator').waitFor({
				state: 'visible',
				timeout: 2000
			});
		} catch {
			// Content might already be marked as dirty
		}

		// Then wait for the auto-saved indicator to appear
		try {
			await this.page.getByTestId('auto-saved').waitFor({
				state: 'visible',
				timeout: timeoutMs
			});
		} catch {
			// If no visual indicator, wait for network to settle
			await this.page.waitForLoadState('networkidle', { timeout: timeoutMs });
		}
	}

	/**
	 * Verify content is displayed in editor
	 */
	async verifyContent(expectedContent: string) {
		await expect(this.contentEditor).toContainText(expectedContent);
	}

	/**
	 * Verify document title is displayed
	 */
	async verifyTitle(expectedTitle: string) {
		await expect(this.titleInput).toHaveValue(expectedTitle);
	}

	/**
	 * Check if document has unsaved changes
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
	async makeBold() {
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
	 * Get current document path from UI
	 */
	async getCurrentPath(): Promise<string> {
		if (await this.documentPathInfo.isVisible()) {
			return (await this.documentPathInfo.textContent()) || '';
		}
		return '';
	}

	/**
	 * Legacy aliases for backwards compatibility
	 */
	async fillPageDetails(title: string, content: string, tags: string[] = []) {
		return this.fillDocumentDetails(title, content, tags);
	}

	async deletePage() {
		return this.deleteDocument();
	}

	// Legacy property aliases
	get pagePathInfo() {
		return this.documentPathInfo;
	}
}

import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class EditorPage extends BasePage {
	readonly titleInput: Locator;
	readonly contentEditor: Locator;
	readonly tagsInput: Locator;
	readonly saveButton: Locator;
	readonly cancelButton: Locator;
	readonly deleteButton: Locator;
	readonly confirmDeleteButton: Locator;

	readonly editorToolbar: Locator;
	readonly previewToggle: Locator;
	readonly previewPane: Locator;
	readonly imageUploadButton: Locator;
	readonly fileUploadInput: Locator;

	readonly saveStatus: Locator;
	readonly errorMessage: Locator;
	readonly loadingSpinner: Locator;

	readonly documentPathInfo: Locator;
	readonly breadcrumbs: Locator;

	constructor(page: Page) {
		super(page);

		this.titleInput = page.getByTestId('document-title-input');
		this.contentEditor = page
			.locator('.cm-editor .cm-content, textarea[placeholder*="content"]')
			.first();
		this.tagsInput = page.getByTestId('tags-input');
		this.saveButton = page.getByTestId('save-document-button');
		this.cancelButton = page.getByTestId('cancel-button');
		this.deleteButton = page.getByTestId('delete-document-button');
		this.confirmDeleteButton = page.getByTestId('confirm-delete-button');

		this.editorToolbar = page.getByTestId('editor-toolbar');
		this.previewToggle = page.getByRole('button', { name: /preview/i });
		this.previewPane = page.getByTestId('preview-pane');
		this.imageUploadButton = page.getByRole('button', { name: /upload image|image/i });
		this.fileUploadInput = page.locator('input[type="file"]');

		this.saveStatus = page.getByTestId('save-status');
		this.errorMessage = page.locator('[data-testid="error-message"], .error');
		this.loadingSpinner = page.locator('[data-testid="loading"], .loading');

		this.documentPathInfo = page.getByTestId('document-path');
		this.breadcrumbs = page.getByTestId('breadcrumbs');
	}

	async navigateToNew() {
		await this.goto('/new');
		await this.waitForLoad();
	}

	async navigateToEdit(documentPath: string) {
		await this.goto(`/edit${documentPath}`);
		await this.waitForLoad();
	}

	async verifyLoaded() {
		await this.waitForVisible(this.titleInput);
		await this.waitForVisible(this.contentEditor);
		await this.waitForVisible(this.saveButton);
	}

	async fillDocumentDetails(title: string, content: string, tags: string[] = []) {
		await this.fillInput(this.titleInput, title);

		await this.contentEditor.click();
		await this.contentEditor.fill(content);

		if (tags.length > 0) {
			await this.addTags(tags);
		}
	}

	async addTags(tags: string[]) {
		for (const tag of tags) {
			await this.tagsInput.clear();
			await this.tagsInput.fill(tag);
			await this.page.keyboard.press('Enter');
			await expect(this.tagsInput).toHaveValue('');
		}
	}

	async save() {
		await this.saveButton.click();
		await this.page.waitForLoadState('networkidle');
	}

	async saveAndExpectNavigation() {
		await Promise.all([
			this.page.waitForURL(/\/documents\//, { timeout: 5000 }),
			this.saveButton.click()
		]);
	}

	async cancel() {
		await this.cancelButton.click();
	}

	async deleteDocument() {
		await this.deleteButton.click();
		await this.waitForVisible(this.confirmDeleteButton);
		await this.confirmDeleteButton.click();
		await this.page.waitForLoadState('networkidle');
	}

	async typeContent(content: string) {
		await this.contentEditor.click();
		await this.contentEditor.pressSequentially(content);
	}

	async clearContent() {
		await this.contentEditor.click();
		await this.page.keyboard.press('Control+a');
		await this.page.keyboard.press('Delete');
	}

	async togglePreview() {
		if (await this.previewToggle.isVisible()) {
			await this.previewToggle.click();
		}
	}

	async uploadImage(filePath: string) {
		const fileChooserPromise = this.page.waitForEvent('filechooser');

		if (await this.imageUploadButton.isVisible()) {
			await this.imageUploadButton.click();
		} else {
			await this.fileUploadInput.setInputFiles(filePath);
			return;
		}

		const fileChooser = await fileChooserPromise;
		await fileChooser.setFiles(filePath);

		await this.page.waitForLoadState('networkidle');
	}

	async saveWithKeyboard() {
		await this.page.keyboard.press('Control+s');
		await this.page.waitForLoadState('networkidle');
	}

	async waitForAutoSave(timeoutMs: number = 15000) {
		try {
			await this.page.getByTestId('unsaved-indicator').waitFor({
				state: 'visible',
				timeout: 2000
			});
		} catch {
			// Content might already be marked as dirty
		}

		try {
			await this.page.getByTestId('auto-saved').waitFor({
				state: 'visible',
				timeout: timeoutMs
			});
		} catch {
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

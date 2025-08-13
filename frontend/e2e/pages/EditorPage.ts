import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class EditorPage extends BasePage {
	readonly contentEditor: Locator;
	readonly saveButton: Locator;
	readonly cancelButton: Locator;
	readonly deleteButton: Locator;
	readonly confirmDeleteButton: Locator;

	readonly editorToolbar: Locator;
	readonly previewToggle: Locator;
	readonly previewPane: Locator;
	readonly imageUploadButton: Locator;
	readonly fileUploadInput: Locator;

	readonly errorMessage: Locator;
	readonly documentTitle: Locator;

	constructor(page: Page) {
		super(page);

		this.contentEditor = page.locator('.cm-editor .cm-content').first();

		this.saveButton = page.getByTestId('save-document-button');
		this.cancelButton = page.getByTestId('cancel-button');
		this.deleteButton = page.getByTestId('delete-document-button');
		this.confirmDeleteButton = page.getByTestId('confirm-delete-button');

		this.editorToolbar = page.getByTestId('editor-toolbar');
		this.previewToggle = page.getByTestId('preview-toggle-button');
		this.previewPane = page.getByTestId('preview-pane');
		this.imageUploadButton = page.getByTestId('image-upload-button');
		this.fileUploadInput = page.locator('input[type="file"]');

		this.errorMessage = page.locator('.bg-red-muted, [data-testid="error-message"]');
		this.documentTitle = page.locator('h1').first();
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
		await this.waitForVisible(this.contentEditor);
		await this.waitForVisible(this.saveButton);
	}

	async fillDocumentDetails(title: string, content: string, tags: string[] = []) {
		let fullContent = `# ${title}\n\n${content}`;

		if (tags.length > 0) {
			const hashtags = tags.map((tag) => `#${tag}`).join(' ');
			fullContent += `\n\n${hashtags}`;
		}

		await this.setContent(fullContent);
	}

	async setContent(content: string) {
		await this.clearContent();
		await this.typeContent(content);
	}

	async addHashtags(tags: string[]) {
		if (tags.length > 0) {
			const hashtags = tags.map((tag) => `#${tag}`).join(' ');
			await this.appendContent(`\n\n${hashtags}`);
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

	async appendContent(content: string) {
		await this.contentEditor.click();
		await this.page.keyboard.press('Control+End');
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
			void 0;
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

	async verifyContent(expectedContent: string) {
		await expect(this.contentEditor).toContainText(expectedContent);
	}

	async verifyTitle(expectedTitle: string) {
		await expect(this.documentTitle).toContainText(expectedTitle);
	}

	async verifyHashtags(expectedTags: string[]) {
		for (const tag of expectedTags) {
			await expect(this.contentEditor).toContainText(`#${tag}`);
		}
	}

	async getContent(): Promise<string> {
		return (await this.contentEditor.textContent()) || '';
	}

	async hasUnsavedChanges(): Promise<boolean> {
		return await this.elementExists('[data-testid="unsaved-changes"]');
	}

	async verifyError(expectedError: string) {
		await this.waitForVisible(this.errorMessage);
		await expect(this.errorMessage).toContainText(expectedError);
	}

	async makeBold() {
		await this.contentEditor.selectText();
		await this.page.keyboard.press('Control+b');
	}

	async insertHeading(level: number, text: string) {
		const headingMarkdown = '#'.repeat(level) + ' ' + text;
		await this.typeContent(headingMarkdown);
	}

	async insertLink(linkText: string, url: string) {
		const linkMarkdown = `[${linkText}](${url})`;
		await this.typeContent(linkMarkdown);
	}

	async getCurrentPath(): Promise<string> {
		const pathElement = this.page.locator('p:has-text("Editing")').first();
		if (await pathElement.isVisible()) {
			const text = (await pathElement.textContent()) || '';
			const match = text.match(/Editing\s+(.+)/);
			return match ? match[1] : '';
		}
		return '';
	}

	async fillPageDetails(title: string, content: string, tags: string[] = []) {
		return this.fillDocumentDetails(title, content, tags);
	}
}

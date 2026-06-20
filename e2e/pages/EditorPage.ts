import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class EditorPage extends BasePage {
	readonly contentEditor: Locator;
	readonly saveButton: Locator;
	readonly cancelButton: Locator;
	readonly deleteButton: Locator;
	readonly confirmDeleteButton: Locator;

	readonly documentTitle: Locator;

	constructor(page: Page) {
		super(page);

		this.contentEditor = page.locator('.cm-editor .cm-content').first();

		this.saveButton = page.getByTestId('save-document-button');
		this.cancelButton = page.getByTestId('cancel-button');
		this.deleteButton = page.getByTestId('delete-document-button');
		this.confirmDeleteButton = page.getByTestId('confirm-delete-button');

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
		await this.waitForContentReady(this.contentEditor);
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

	async fillPageDetails(title: string, content: string, tags: string[] = []) {
		return this.fillDocumentDetails(title, content, tags);
	}

	async fillTitle(title: string) {
		await this.clearContent();
		await this.typeContent(`# ${title}\n\n`);
	}

	async fillContent(content: string) {
		await this.appendContent(content);
	}
}

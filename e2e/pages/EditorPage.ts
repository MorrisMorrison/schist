import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * The markdown editor, in both places it appears: the new-document page (with
 * Save Document / Cancel buttons) and edit mode on a document page (in place,
 * saved with Ctrl/Cmd+S, by auto-save, or by switching back to Read).
 */
export class EditorPage extends BasePage {
	readonly contentEditor: Locator;
	/** New-document page only. */
	readonly saveButton: Locator;
	/** New-document page only. */
	readonly cancelButton: Locator;
	/** Document page: switches back to the reading view (saving first). */
	readonly readButton: Locator;

	/** The first `# heading` line, which is the title while editing. */
	readonly documentTitle: Locator;

	/** Shown while there are changes auto-save has not written yet. */
	readonly unsavedIndicator: Locator;
	/** New-document page: switches the editor to its rendered preview. */
	readonly previewButton: Locator;
	readonly preview: Locator;

	constructor(page: Page) {
		super(page);

		this.contentEditor = page.locator('.cm-editor .cm-content').first();

		this.saveButton = page.getByTestId('save-document-button');
		this.cancelButton = page.getByTestId('cancel-button');
		this.readButton = page.getByTestId('read-mode-button');

		this.documentTitle = page.locator('.cm-editor .cm-prose-title').first();

		this.unsavedIndicator = page.getByTestId('unsaved-indicator');
		this.previewButton = page.getByTestId('preview-mode-button');
		this.preview = page.getByTestId('markdown-preview');
	}

	/** True on the new-document page, false in a document's edit mode. */
	private async isNewDocumentPage(): Promise<boolean> {
		return new URL(this.page.url()).pathname.startsWith('/new');
	}

	async navigateToNew() {
		await this.goto('/new');
		await this.waitForLoad();
	}

	/** Opens a document in edit mode through the /edit/<path> deep link. */
	async navigateToEdit(documentPath: string) {
		await this.goto(`/edit${documentPath}`);
		await this.page.waitForURL(/\/documents\/.*\?mode=edit/);
		await this.waitForLoad();
	}

	async verifyLoaded() {
		await this.waitForContentReady(this.contentEditor);
		await this.waitForVisible(this.saveButton.or(this.readButton).first());
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

	/** Saves and stays in the editor (Ctrl+S in edit mode). */
	async save() {
		if (await this.isNewDocumentPage()) {
			await this.saveButton.click();
			await this.page.waitForLoadState('networkidle');
			return;
		}
		const saved = this.page.waitForResponse(
			(res) => res.request().method() === 'PUT' && res.url().includes('/api/documents/'),
			{ timeout: 15000 }
		);
		await this.contentEditor.press('Control+s');
		expect((await saved).ok()).toBeTruthy();
	}

	/**
	 * Saves and ends up on the document's reading view: Save Document on the
	 * new-document page, the Read toggle (which saves first) in edit mode.
	 */
	async saveAndExpectNavigation() {
		// 15s like the other page-load waits: a 5s budget was tight for large
		// documents on a slow runner.
		if (await this.isNewDocumentPage()) {
			await Promise.all([
				this.page.waitForURL(/\/documents\//, { timeout: 15000 }),
				this.saveButton.click()
			]);
			return;
		}
		await this.readButton.click();
		await expect(this.page.getByTestId('document-view')).toHaveAttribute('data-mode', 'read', {
			timeout: 15000
		});
		await expect(this.page).not.toHaveURL(/mode=edit/);
	}

	/** Leaves the editor: Cancel on the new-document page, Read in edit mode. */
	async cancel() {
		if (await this.isNewDocumentPage()) {
			await this.cancelButton.click();
			return;
		}
		await this.readButton.click();
	}

	/** Switch to the rendered preview and return it. */
	async showPreview() {
		await this.previewButton.click();
		return this.preview;
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
			await this.unsavedIndicator.waitFor({
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

	async fillTitle(title: string) {
		await this.clearContent();
		await this.typeContent(`# ${title}\n\n`);
	}
}

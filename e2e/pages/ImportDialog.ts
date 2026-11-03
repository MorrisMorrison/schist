import { type Page, type Locator, expect } from '@playwright/test';
import type { ImportResultData } from '../utils/api-helpers';

export type ConflictMode = 'Skip' | 'Rename' | 'Overwrite';

/**
 * The "Import Documents" dialog, opened from the sidebar's Import button, its
 * "+" menu or a folder's context menu.
 */
export class ImportDialog {
	readonly page: Page;
	readonly dialog: Locator;
	readonly fileInput: Locator;
	readonly folderInput: Locator;
	readonly targetInput: Locator;
	readonly targetHint: Locator;
	readonly leftOut: Locator;
	readonly submitButton: Locator;
	readonly summary: Locator;

	constructor(page: Page) {
		this.page = page;
		this.dialog = page.getByTestId('import-documents-modal');
		this.fileInput = this.dialog.getByLabel('Select Markdown Files');
		this.folderInput = this.dialog.getByLabel('Select a folder');
		this.targetInput = this.dialog.getByTestId('import-target-path');
		this.targetHint = this.dialog.getByTestId('import-target-hint');
		this.leftOut = this.dialog.getByTestId('import-left-out');
		this.submitButton = this.dialog.getByRole('button', { name: 'Import Documents' });
		this.summary = this.dialog.getByText('Import Summary');
	}

	async openFromSidebarButton() {
		await this.page.getByTestId('sidebar-import-button').click();
		await expect(this.dialog).toBeVisible();
	}

	async openFromNewMenu() {
		await this.page.getByTestId('sidebar-new-menu').click();
		await this.page.getByRole('menuitem', { name: 'Import documents' }).click();
		await expect(this.dialog).toBeVisible();
	}

	/** Chooses a folder from disk, as the "Choose a folder" button does. */
	async chooseFolder(directory: string) {
		await this.folderInput.setInputFiles(directory);
	}

	async chooseFiles(files: { name: string; mimeType: string; buffer: Buffer }[]) {
		await this.fileInput.setInputFiles(files);
	}

	async setTarget(path: string) {
		await this.targetInput.fill(path);
		await expect(this.targetInput).toHaveValue(path);
	}

	async chooseConflictMode(mode: ConflictMode) {
		await this.dialog.getByRole('radio', { name: mode }).click();
		await expect(this.dialog.getByRole('radio', { name: mode })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	}

	/**
	 * Starts the import and returns the server's report. The dialog shows the
	 * summary right away; after a clean import it closes itself, so assertions
	 * on the report use the returned data rather than the dialog.
	 */
	async submit(): Promise<ImportResultData> {
		const response = this.page.waitForResponse(
			(r) => r.url().includes('/api/import/documents') && r.request().method() === 'POST'
		);
		await this.submitButton.click();
		return (await (await response).json()) as ImportResultData;
	}

	/** Closes the dialog after an import (it may already have closed itself). */
	async finish() {
		const done = this.dialog.getByRole('button', { name: /^(Done|Close)$/ });
		if (await done.isVisible().catch(() => false)) {
			await done.click().catch(() => {});
		}
		await expect(this.dialog).toBeHidden();
	}
}

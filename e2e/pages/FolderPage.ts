import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class FolderPage extends BasePage {
	readonly folderTitle: Locator;
	readonly documents: Locator;
	readonly emptyFolderMessage: Locator;

	readonly createFolderButton: Locator;

	readonly createFolderModal: Locator;
	readonly folderNameInput: Locator;
	readonly confirmCreateFolder: Locator;
	readonly cancelCreateFolder: Locator;

	readonly folderTree: Locator;
	readonly contextMenu: Locator;

	constructor(page: Page) {
		super(page);

		this.folderTitle = page.locator('h1').first();
		this.documents = page.getByTestId('documents-section');
		this.emptyFolderMessage = page.getByTestId('empty-folder-message');

		this.createFolderButton = page
			.getByTestId('create-folder-header')
			.or(page.getByTestId('create-folder-empty'))
			.first();

		this.createFolderModal = page.getByTestId('create-folder-modal');
		this.folderNameInput = page.getByTestId('folder-name');
		this.confirmCreateFolder = this.createFolderModal.getByTestId('create-folder-btn');
		this.cancelCreateFolder = this.createFolderModal.getByTestId('cancel-create-folder-btn');

		this.folderTree = page.getByTestId('folder-tree');
		this.contextMenu = page.getByTestId('context-menu');
	}

	async navigateToFolder(folderPath: string = '') {
		await this.goto(`/folders${folderPath}`);
		await this.waitForLoad();
	}

	async navigateToRoot() {
		await this.navigateToFolder('');
	}

	async verifyFolderLoaded(expectedFolderName?: string) {
		await this.waitForContentReady(this.folderTitle);

		if (expectedFolderName) {
			const displayName =
				expectedFolderName.charAt(0).toUpperCase() + expectedFolderName.slice(1).replace(/-/g, ' ');
			await expect(this.folderTitle).toContainText(displayName);
		}
	}

	/**
	 * Create a folder through the "New Folder" modal and wait for the backend to
	 * confirm it (rather than for network idle plus a fixed sleep).
	 */
	async createFolder(folderName: string) {
		await this.createFolderButton.click();

		await this.waitForVisible(this.createFolderModal);
		await this.waitForVisible(this.folderNameInput);
		await this.fillInput(this.folderNameInput, folderName);

		const created = this.page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				new URL(response.url()).pathname.endsWith('/api/folders')
		);
		await this.confirmCreateFolder.click();
		expect((await created).ok()).toBe(true);

		await expect(this.createFolderModal).toBeHidden();
	}

	/** The sidebar tree's "Open folder <name>" button for an exact folder name. */
	folderButton(folderName: string): Locator {
		return this.folderTree.getByRole('button', { name: `Open folder ${folderName}`, exact: true });
	}

	/**
	 * The sidebar tree row for an exact folder name: the closest row around its
	 * button. Rows nest, and a `has:` filter is resolved inside each row, so
	 * filtering rows by the tree-rooted button never matched (and would also
	 * match every ancestor row).
	 */
	treeItem(folderName: string): Locator {
		return this.folderButton(folderName).locator(
			'xpath=ancestor::*[@data-testid="folder-tree-item"][1]'
		);
	}

	async openSubFolder(folderName: string) {
		await this.folderButton(folderName).click();
		await this.waitForLoad();
	}

	async verifyContainsFolder(folderName: string) {
		await expect(this.folderButton(folderName)).toBeVisible({ timeout: 10000 });
	}

	async verifyFolderNotInTree(folderName: string) {
		await expect(this.folderButton(folderName)).toHaveCount(0);
	}

	/**
	 * Right-click a folder in the tree and wait for its context menu. Clicks the
	 * folder's own name button (the row handles the event), so the click can't
	 * land on an expanded child row.
	 */
	async openContextMenu(folderName: string) {
		await expect(this.treeItem(folderName)).toBeVisible();
		await this.folderButton(folderName).click({ button: 'right' });
		await expect(this.contextMenu).toBeVisible();
		return this.contextMenu;
	}

	async verifyContainsDocument(documentName: string) {
		await expect(this.documents.getByText(documentName)).toBeVisible();
	}

	/** Expand a folder's tree row if it is collapsed (no-op if already expanded). */
	async expandTreeNode(folderName: string) {
		const item = this.treeItem(folderName);
		// aria-expanded is only rendered once the folder has expandable content.
		await expect(item).toHaveAttribute('aria-expanded', /^(true|false)$/);
		if ((await item.getAttribute('aria-expanded')) === 'false') {
			await item.getByRole('button', { name: 'Expand folder' }).click();
		}
		await expect(item).toHaveAttribute('aria-expanded', 'true');
	}

	async getSubFolderCount(): Promise<number> {
		const folderButtons = this.folderTree.getByRole('button', { name: /^Open folder / });
		return await folderButtons.count();
	}

	async verifyFolderUrl(expectedPath: string) {
		await this.expectUrl(`/folders${expectedPath}`);
	}
}

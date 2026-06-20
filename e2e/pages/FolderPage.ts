import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class FolderPage extends BasePage {
	readonly folderTitle: Locator;
	readonly folderPath: Locator;
	readonly subFolders: Locator;
	readonly documents: Locator;
	readonly emptyFolderMessage: Locator;

	readonly createFolderButton: Locator;
	readonly folderActionsMenu: Locator;

	readonly createFolderModal: Locator;
	readonly folderNameInput: Locator;
	readonly confirmCreateFolder: Locator;
	readonly cancelCreateFolder: Locator;

	readonly folderTree: Locator;
	readonly folderTreeItems: Locator;
	readonly expandableNodes: Locator;

	readonly itemsList: Locator;
	readonly itemNames: Locator;
	readonly itemDates: Locator;

	readonly breadcrumbs: Locator;
	readonly backButton: Locator;
	readonly homeLink: Locator;

	constructor(page: Page) {
		super(page);

		this.folderTitle = page.locator('h1').first();
		this.folderPath = page.getByTestId('folder-path');
		this.subFolders = page.getByTestId('folder-tree');
		this.documents = page.getByTestId('documents-section');
		this.emptyFolderMessage = page.getByTestId('empty-folder-message');

		this.createFolderButton = page
			.getByTestId('create-folder-header')
			.or(page.getByTestId('create-folder-empty'))
			.first();
		this.folderActionsMenu = page.getByTestId('folder-actions');

		this.createFolderModal = page.getByTestId('create-folder-modal');
		this.folderNameInput = page.getByTestId('folder-name');
		this.confirmCreateFolder = this.createFolderModal.getByTestId('create-folder-btn');
		this.cancelCreateFolder = this.createFolderModal.getByTestId('cancel-create-folder-btn');

		this.folderTree = page.getByTestId('folder-tree');
		this.folderTreeItems = this.folderTree.locator('[role="treeitem"]');
		this.expandableNodes = this.folderTree.locator('[aria-expanded]');

		this.itemsList = page.getByTestId('items-list');
		this.itemNames = this.itemsList.getByTestId('item-name');
		this.itemDates = this.itemsList.getByTestId('item-date');

		this.breadcrumbs = page.getByTestId('breadcrumbs');
		this.backButton = page.getByRole('button', { name: /back/i });
		this.homeLink = page.getByRole('link', { name: /home/i });
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

	async createFolder(folderName: string) {
		await this.createFolderButton.click();

		await this.waitForVisible(this.createFolderModal);

		await this.waitForVisible(this.folderNameInput);

		await this.fillInput(this.folderNameInput, folderName);

		await this.confirmCreateFolder.click();

		await expect(this.createFolderModal).toBeHidden();

		await this.page.waitForLoadState('networkidle');

		await this.page.waitForTimeout(200);
	}

	async openSubFolder(folderName: string) {
		const folderButton = this.folderTree.getByRole('button', { name: `Open folder ${folderName}` });
		await folderButton.click();
		await this.waitForLoad();
	}

	async verifyContainsFolder(folderName: string) {
		const expandButtons = this.folderTree.getByRole('button').filter({ hasText: /expand folder/i });
		const expandCount = await expandButtons.count();

		for (let i = 0; i < expandCount; i++) {
			const expandButton = expandButtons.nth(i);
			if (await expandButton.isVisible()) {
				await expandButton.click();
				await this.page.waitForTimeout(300);
			}
		}

		const folderButton = this.folderTree.getByRole('button', {
			name: new RegExp(`Open folder ${folderName}`, 'i')
		});

		await this.page.waitForTimeout(500);
		await expect(folderButton.first()).toBeVisible({ timeout: 10000 });
	}

	async folderExistsInSidebar(folderName: string): Promise<boolean> {
		try {
			const folderButton = this.folderTree.getByRole('button', {
				name: new RegExp(`Open folder ${folderName}`, 'i')
			});
			return await folderButton.first().isVisible({ timeout: 2000 });
		} catch {
			return false;
		}
	}

	async verifyContainsDocument(documentName: string) {
		const documentByTestId = this.documents
			.getByTestId('document-item')
			.filter({ hasText: documentName });
		const documentByText = this.documents.getByText(documentName);

		if (
			await documentByTestId
				.first()
				.isVisible()
				.catch(() => false)
		) {
			await expect(documentByTestId.first()).toBeVisible();
		} else {
			await expect(documentByText).toBeVisible();
		}
	}

	async verifyEmptyFolder() {
		await expect(this.emptyFolderMessage).toBeVisible();
	}

	async clickBreadcrumb(breadcrumbText: string) {
		const breadcrumb = this.breadcrumbs.getByRole('link', { name: breadcrumbText });
		await breadcrumb.click();
		await this.waitForLoad();
	}

	async getBreadcrumbPath(): Promise<string[]> {
		const breadcrumbLinks = this.breadcrumbs.locator('a');
		return await breadcrumbLinks.allTextContents();
	}

	async expandTreeNode(folderName: string) {
		const node = this.folderTree.getByTestId('folder-tree-item').filter({ hasText: folderName });
		const expandButton = node
			.getByTestId('folder-expand-button')
			.locator('[aria-expanded="false"]');

		if (await expandButton.isVisible()) {
			await expandButton.click();
		}
	}

	async getSubFolderCount(): Promise<number> {
		const folderButtons = this.folderTree.getByRole('button', { name: /^Open folder / });
		return await folderButtons.count();
	}

	async goBack() {
		if (await this.backButton.isVisible()) {
			await this.backButton.click();
		} else {
			const breadcrumbs = this.breadcrumbs.locator('a');
			const parentBreadcrumb = breadcrumbs.nth(-2);
			if (await parentBreadcrumb.isVisible()) {
				await parentBreadcrumb.click();
			}
		}
		await this.waitForLoad();
	}

	async verifyFolderUrl(expectedPath: string) {
		await this.expectUrl(`/folders${expectedPath}`);
	}
}

import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class FolderPage extends BasePage {
	readonly folderTitle: Locator;
	readonly folderPath: Locator;
	readonly subFolders: Locator;
	readonly documents: Locator;
	readonly emptyFolderMessage: Locator;

	readonly createFolderButton: Locator;
	readonly createDocumentButton: Locator;
	readonly folderActionsMenu: Locator;

	readonly createFolderModal: Locator;
	readonly folderNameInput: Locator;
	readonly confirmCreateFolder: Locator;
	readonly cancelCreateFolder: Locator;

	readonly folderTree: Locator;
	readonly folderTreeItems: Locator;
	readonly expandableNodes: Locator;

	readonly itemsList: Locator;
	readonly folderItems: Locator;
	readonly documentItems: Locator;
	readonly itemNames: Locator;
	readonly itemDates: Locator;

	readonly breadcrumbs: Locator;
	readonly backButton: Locator;
	readonly homeLink: Locator;

	readonly viewToggle: Locator;
	readonly sortOptions: Locator;
	readonly filterInput: Locator;

	constructor(page: Page) {
		super(page);

		this.folderTitle = page.locator('h1').first();
		this.folderPath = page.getByTestId('folder-path');
		this.subFolders = page.getByTestId('folder-tree');
		this.documents = page.getByTestId('documents-section');
		this.emptyFolderMessage = page.getByTestId('empty-folder-message');

		this.createFolderButton = page
			.getByRole('button', { name: /new folder|create folder/i })
			.first();
		this.createDocumentButton = page
			.getByRole('button', { name: /new page|create page|new document|create document/i })
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
		this.folderItems = this.itemsList.getByTestId('folder-item');
		this.documentItems = this.itemsList.getByTestId('document-item');
		this.itemNames = this.itemsList.getByTestId('item-name');
		this.itemDates = this.itemsList.getByTestId('item-date');

		this.breadcrumbs = page.getByTestId('breadcrumbs');
		this.backButton = page.getByRole('button', { name: /back/i });
		this.homeLink = page.getByRole('link', { name: /home/i });

		this.viewToggle = page.getByTestId('view-toggle');
		this.sortOptions = page.getByTestId('sort-options');
		this.filterInput = page.getByPlaceholder(/filter|search/i);
	}

	async navigateToFolder(folderPath: string = '') {
		await this.goto(`/folders${folderPath}`);
		await this.waitForLoad();
	}

	async navigateToRoot() {
		await this.navigateToFolder('');
	}

	async verifyFolderLoaded(expectedFolderName?: string) {
		await this.waitForVisible(this.folderTitle);

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

	async cancelFolderCreation() {
		await this.createFolderButton.click();
		await this.waitForVisible(this.createFolderModal);
		await this.cancelCreateFolder.click();
	}

	async createDocumentInFolder() {
		await this.createDocumentButton.click();
		await this.page.waitForURL(/\/new/);
	}

	async openSubFolder(folderName: string) {
		const folderButton = this.folderTree.getByRole('button', { name: `Open folder ${folderName}` });
		await folderButton.click();
		await this.waitForLoad();
	}

	async openDocument(documentName: string) {
		const documentLink = this.documents.getByRole('link', { name: documentName });
		await documentLink.click();
		await this.waitForLoad();
	}

	async getSubFolderNames(): Promise<string[]> {
		const folderButtons = this.folderTree.getByRole('button', { name: /^Open folder / });
		const ariaLabels = await folderButtons.evaluateAll((elements) =>
			elements.map((el) => el.getAttribute('aria-label') || '')
		);
		return ariaLabels.map((label) => label.replace('Open folder ', ''));
	}

	async getDocumentNames(): Promise<string[]> {
		const documentLinks = this.documents.locator('a');
		return await documentLinks.allTextContents();
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

	async findDocumentByPath(documentPath: string) {
		return this.documents
			.locator(`[aria-label*="${documentPath}"]`)
			.or(this.documents.getByTestId('document-item').filter({ hasText: documentPath }));
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

	async collapseTreeNode(folderName: string) {
		const node = this.folderTree.getByTestId('folder-tree-item').filter({ hasText: folderName });
		const collapseButton = node
			.getByTestId('folder-expand-button')
			.locator('[aria-expanded="true"]');

		if (await collapseButton.isVisible()) {
			await collapseButton.click();
		}
	}

	async clickTreeFolder(folderPath: string) {
		const treeLink = this.folderTree.getByRole('link', { name: folderPath });
		await treeLink.click();
		await this.waitForLoad();
	}

	async filterContents(searchTerm: string) {
		await this.filterInput.fill(searchTerm);
		await expect(this.filterInput).toHaveValue(searchTerm);
		await this.page.waitForLoadState('networkidle');
	}

	async clearFilter() {
		await this.filterInput.clear();
	}

	async sortBy(sortOption: string) {
		if (await this.sortOptions.isVisible()) {
			await this.sortOptions.selectOption(sortOption);
			await this.page.waitForLoadState('networkidle');
		}
	}

	async getTotalItemCount(): Promise<number> {
		const folderCount = await this.folderItems.count();
		const documentCount = await this.documentItems.count();
		return folderCount + documentCount;
	}

	async getSubFolderCount(): Promise<number> {
		const folderButtons = this.folderTree.getByRole('button', { name: /^Open folder / });
		return await folderButtons.count();
	}

	async getDocumentCount(): Promise<number> {
		return await this.documentItems.count();
	}

	async verifyFolderDepth(expectedDepth: number) {
		const breadcrumbs = await this.getBreadcrumbPath();
		expect(breadcrumbs.length).toBe(expectedDepth + 1);
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

	async canCreateFolder(): Promise<boolean> {
		return await this.createFolderButton.isVisible();
	}

	async canCreateDocument(): Promise<boolean> {
		return await this.createDocumentButton.isVisible();
	}

	async canCreatePage(): Promise<boolean> {
		return await this.canCreateDocument();
	}

	async createPageInFolder() {
		return await this.createDocumentInFolder();
	}

	async openPage(pageName: string) {
		return await this.openDocument(pageName);
	}

	async getPageNames(): Promise<string[]> {
		return await this.getDocumentNames();
	}

	async verifyContainsPage(pageName: string) {
		return await this.verifyContainsDocument(pageName);
	}

	async getPageCount(): Promise<number> {
		return await this.getDocumentCount();
	}

	get pages() {
		return this.documents;
	}
	get pageItems() {
		return this.documentItems;
	}
	get createPageButton() {
		return this.createDocumentButton;
	}
}

import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for folder views (/folders/[...path])
 */
export class FolderPage extends BasePage {
	// Folder content
	readonly folderTitle: Locator;
	readonly folderPath: Locator;
	readonly subFolders: Locator;
	readonly pages: Locator;
	readonly emptyFolderMessage: Locator;

	// Folder actions
	readonly createFolderButton: Locator;
	readonly createPageButton: Locator;
	readonly folderActionsMenu: Locator;

	// Create folder modal
	readonly createFolderModal: Locator;
	readonly folderNameInput: Locator;
	readonly confirmCreateFolder: Locator;
	readonly cancelCreateFolder: Locator;

	// Folder tree (sidebar)
	readonly folderTree: Locator;
	readonly folderTreeItems: Locator;
	readonly expandableNodes: Locator;

	// List view
	readonly itemsList: Locator;
	readonly folderItems: Locator;
	readonly pageItems: Locator;
	readonly itemNames: Locator;
	readonly itemDates: Locator;

	// Navigation
	readonly breadcrumbs: Locator;
	readonly backButton: Locator;
	readonly homeLink: Locator;

	// View controls
	readonly viewToggle: Locator;
	readonly sortOptions: Locator;
	readonly filterInput: Locator;

	constructor(page: Page) {
		super(page);

		// Folder content
		this.folderTitle = page.locator('h1').first();
		this.folderPath = page.locator('[data-testid="folder-path"]');
		this.subFolders = page.locator('[data-testid="sub-folders"]');
		this.pages = page.locator('[data-testid="folder-pages"]');
		this.emptyFolderMessage = page.getByText(/empty folder|no content/i);

		// Folder actions (be more specific to avoid sidebar button conflicts)
		this.createFolderButton = page
			.locator('main, [data-testid="folder-view"]')
			.getByRole('button', { name: /create folder|new folder/i })
			.first();
		this.createPageButton = page
			.locator('main, [data-testid="folder-view"]')
			.getByRole('button', { name: /create page|new page/i });
		this.folderActionsMenu = page.locator('[data-testid="folder-actions"]');

		// Create folder modal
		this.createFolderModal = page.locator('[data-testid="create-folder-modal"]');
		this.folderNameInput = page.getByLabel(/folder name/i);
		this.confirmCreateFolder = page.getByRole('button', { name: /create|confirm/i });
		this.cancelCreateFolder = page.getByRole('button', { name: /cancel/i });

		// Folder tree
		this.folderTree = page.locator('[data-testid="folder-tree"]');
		this.folderTreeItems = this.folderTree.locator('[role="treeitem"]');
		this.expandableNodes = this.folderTree.locator('[aria-expanded]');

		// List view
		this.itemsList = page.locator('[data-testid="items-list"]');
		this.folderItems = this.itemsList.locator('[data-testid="folder-item"]');
		this.pageItems = this.itemsList.locator('[data-testid="page-item"]');
		this.itemNames = this.itemsList.locator('[data-testid="item-name"]');
		this.itemDates = this.itemsList.locator('[data-testid="item-date"]');

		// Navigation
		this.breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
		this.backButton = page.getByRole('button', { name: /back/i });
		this.homeLink = page.getByRole('link', { name: /home/i });

		// View controls
		this.viewToggle = page.locator('[data-testid="view-toggle"]');
		this.sortOptions = page.locator('[data-testid="sort-options"]');
		this.filterInput = page.getByPlaceholder(/filter|search/i);
	}

	/**
	 * Navigate to a specific folder
	 */
	async navigateToFolder(folderPath: string = '') {
		await this.goto(`/folders${folderPath}`);
		await this.waitForLoad();
	}

	/**
	 * Navigate to root folders page
	 */
	async navigateToRoot() {
		await this.navigateToFolder('');
	}

	/**
	 * Verify folder page is loaded
	 */
	async verifyFolderLoaded(expectedFolderName?: string) {
		await this.waitForVisible(this.folderTitle);

		if (expectedFolderName) {
			await expect(this.folderTitle).toContainText(expectedFolderName);
		}
	}

	/**
	 * Create a new folder
	 */
	async createFolder(folderName: string) {
		await this.createFolderButton.click();
		await this.waitForVisible(this.createFolderModal);

		await this.fillInput(this.folderNameInput, folderName);
		await this.confirmCreateFolder.click();

		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Cancel folder creation
	 */
	async cancelFolderCreation() {
		await this.createFolderButton.click();
		await this.waitForVisible(this.createFolderModal);
		await this.cancelCreateFolder.click();
	}

	/**
	 * Create a new page in current folder
	 */
	async createPageInFolder() {
		await this.createPageButton.click();
		await this.page.waitForURL(/\/new/);
	}

	/**
	 * Navigate to a subfolder
	 */
	async openSubFolder(folderName: string) {
		const folderLink = this.subFolders.getByRole('link', { name: folderName });
		await folderLink.click();
		await this.waitForLoad();
	}

	/**
	 * Navigate to a page in the folder
	 */
	async openPage(pageName: string) {
		const pageLink = this.pages.getByRole('link', { name: pageName });
		await pageLink.click();
		await this.waitForLoad();
	}

	/**
	 * Get list of subfolder names
	 */
	async getSubFolderNames(): Promise<string[]> {
		const folderLinks = this.subFolders.locator('a');
		return await folderLinks.allTextContents();
	}

	/**
	 * Get list of page names in folder
	 */
	async getPageNames(): Promise<string[]> {
		const pageLinks = this.pages.locator('a');
		return await pageLinks.allTextContents();
	}

	/**
	 * Verify folder contains specific subfolder
	 */
	async verifyContainsFolder(folderName: string) {
		const folderLink = this.subFolders.getByRole('link', { name: folderName });
		await expect(folderLink).toBeVisible();
	}

	/**
	 * Verify folder contains specific page
	 */
	async verifyContainsPage(pageName: string) {
		const pageLink = this.pages.getByRole('link', { name: pageName });
		await expect(pageLink).toBeVisible();
	}

	/**
	 * Verify folder is empty
	 */
	async verifyEmptyFolder() {
		await expect(this.emptyFolderMessage).toBeVisible();
	}

	/**
	 * Navigate using breadcrumbs
	 */
	async clickBreadcrumb(breadcrumbText: string) {
		const breadcrumb = this.breadcrumbs.getByRole('link', { name: breadcrumbText });
		await breadcrumb.click();
		await this.waitForLoad();
	}

	/**
	 * Get breadcrumb path
	 */
	async getBreadcrumbPath(): Promise<string[]> {
		const breadcrumbLinks = this.breadcrumbs.locator('a');
		return await breadcrumbLinks.allTextContents();
	}

	/**
	 * Expand folder tree node
	 */
	async expandTreeNode(folderName: string) {
		const node = this.folderTreeItems.filter({ hasText: folderName });
		const expandButton = node.locator('[aria-expanded="false"]');

		if (await expandButton.isVisible()) {
			await expandButton.click();
		}
	}

	/**
	 * Collapse folder tree node
	 */
	async collapseTreeNode(folderName: string) {
		const node = this.folderTreeItems.filter({ hasText: folderName });
		const collapseButton = node.locator('[aria-expanded="true"]');

		if (await collapseButton.isVisible()) {
			await collapseButton.click();
		}
	}

	/**
	 * Navigate via folder tree
	 */
	async clickTreeFolder(folderPath: string) {
		const treeLink = this.folderTree.getByRole('link', { name: folderPath });
		await treeLink.click();
		await this.waitForLoad();
	}

	/**
	 * Filter folder contents
	 */
	async filterContents(searchTerm: string) {
		await this.filterInput.fill(searchTerm);
		await this.page.waitForTimeout(500); // Wait for filter to apply
	}

	/**
	 * Clear filter
	 */
	async clearFilter() {
		await this.filterInput.clear();
	}

	/**
	 * Sort folder contents
	 */
	async sortBy(sortOption: string) {
		if (await this.sortOptions.isVisible()) {
			await this.sortOptions.selectOption(sortOption);
			await this.page.waitForLoadState('networkidle');
		}
	}

	/**
	 * Count total items in folder
	 */
	async getTotalItemCount(): Promise<number> {
		const folderCount = await this.folderItems.count();
		const pageCount = await this.pageItems.count();
		return folderCount + pageCount;
	}

	/**
	 * Count subfolders
	 */
	async getSubFolderCount(): Promise<number> {
		return await this.folderItems.count();
	}

	/**
	 * Count pages in folder
	 */
	async getPageCount(): Promise<number> {
		return await this.pageItems.count();
	}

	/**
	 * Verify folder structure depth
	 */
	async verifyFolderDepth(expectedDepth: number) {
		const breadcrumbs = await this.getBreadcrumbPath();
		expect(breadcrumbs.length).toBe(expectedDepth + 1); // +1 for root
	}

	/**
	 * Navigate back to parent folder
	 */
	async goBack() {
		if (await this.backButton.isVisible()) {
			await this.backButton.click();
		} else {
			// Fallback: use breadcrumbs
			const breadcrumbs = this.breadcrumbs.locator('a');
			const parentBreadcrumb = breadcrumbs.nth(-2); // Second to last
			if (await parentBreadcrumb.isVisible()) {
				await parentBreadcrumb.click();
			}
		}
		await this.waitForLoad();
	}

	/**
	 * Verify folder URL matches expected path
	 */
	async verifyFolderUrl(expectedPath: string) {
		await this.expectUrl(`/folders${expectedPath}`);
	}

	/**
	 * Check if folder creation is allowed
	 */
	async canCreateFolder(): Promise<boolean> {
		return await this.createFolderButton.isVisible();
	}

	/**
	 * Check if page creation is allowed
	 */
	async canCreatePage(): Promise<boolean> {
		return await this.createPageButton.isVisible();
	}
}

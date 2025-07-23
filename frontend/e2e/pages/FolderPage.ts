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
		this.folderPath = page.getByTestId('folder-path');
		this.subFolders = page.getByTestId('folders-section');
		this.pages = page.getByTestId('pages-section');
		this.emptyFolderMessage = page.getByTestId('empty-folder-message');

		// Folder actions (be more specific to avoid sidebar button conflicts)
		this.createFolderButton = page
			.getByRole('button', { name: /new folder|create folder/i })
			.first();
		this.createPageButton = page.getByRole('button', { name: /new page|create page/i }).first();
		this.folderActionsMenu = page.getByTestId('folder-actions');

		// Create folder modal
		this.createFolderModal = page.getByTestId('create-folder-modal');
		this.folderNameInput = page.getByTestId('folder-name');
		this.confirmCreateFolder = this.createFolderModal.getByTestId('create-folder-btn');
		this.cancelCreateFolder = this.createFolderModal.getByTestId('cancel-create-folder-btn');

		// Folder tree
		this.folderTree = page.getByTestId('folder-tree');
		this.folderTreeItems = this.folderTree.locator('[role="treeitem"]');
		this.expandableNodes = this.folderTree.locator('[aria-expanded]');

		// List view
		this.itemsList = page.getByTestId('items-list');
		this.folderItems = this.itemsList.getByTestId('folder-item');
		this.pageItems = this.itemsList.getByTestId('page-item');
		this.itemNames = this.itemsList.getByTestId('item-name');
		this.itemDates = this.itemsList.getByTestId('item-date');

		// Navigation
		this.breadcrumbs = page.getByTestId('breadcrumbs');
		this.backButton = page.getByRole('button', { name: /back/i });
		this.homeLink = page.getByRole('link', { name: /home/i });

		// View controls
		this.viewToggle = page.getByTestId('view-toggle');
		this.sortOptions = page.getByTestId('sort-options');
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
			// Transform folder name to match UI display format (capitalize + replace hyphens with spaces)
			const displayName =
				expectedFolderName.charAt(0).toUpperCase() + expectedFolderName.slice(1).replace(/-/g, ' ');
			await expect(this.folderTitle).toContainText(displayName);
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
		const folderCard = this.subFolders
			.getByTestId('folder-item')
			.filter({ hasText: folderName })
			.first();
		await folderCard.click();
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
		const folderCards = this.subFolders.getByTestId('folder-item');
		return await folderCards.allTextContents();
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
		// Look for folder cards or links within the subfolders section
		const folderCard = this.subFolders.getByTestId('folder-item').filter({ hasText: folderName });
		await expect(folderCard).toBeVisible();
	}

	/**
	 * Verify folder contains specific page
	 */
	async verifyContainsPage(pageName: string) {
		const pageLink = this.pages.getByText(pageName);
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
		const node = this.folderTree.getByTestId('folder-tree-item').filter({ hasText: folderName });
		const expandButton = node
			.getByTestId('folder-expand-button')
			.locator('[aria-expanded="false"]');

		if (await expandButton.isVisible()) {
			await expandButton.click();
		}
	}

	/**
	 * Collapse folder tree node
	 */
	async collapseTreeNode(folderName: string) {
		const node = this.folderTree.getByTestId('folder-tree-item').filter({ hasText: folderName });
		const collapseButton = node
			.getByTestId('folder-expand-button')
			.locator('[aria-expanded="true"]');

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
		// Wait for filter to apply - check that filter value is set
		await expect(this.filterInput).toHaveValue(searchTerm);
		// Allow brief moment for filtering to complete
		await this.page.waitForLoadState('networkidle');
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
		return await this.subFolders.getByTestId('folder-item').count();
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

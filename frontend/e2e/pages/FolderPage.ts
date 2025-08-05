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
		this.subFolders = page.getByTestId('folder-tree'); // Folders are now in sidebar tree only
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
		// Click create folder button
		await this.createFolderButton.click();

		// Wait for modal to be visible
		await this.waitForVisible(this.createFolderModal);

		// Wait for input field to be ready
		await this.waitForVisible(this.folderNameInput);

		// Fill the folder name
		await this.fillInput(this.folderNameInput, folderName);

		// Click create button
		await this.confirmCreateFolder.click();

		// Wait for modal to close
		await expect(this.createFolderModal).toBeHidden();

		// Wait for network requests to complete
		await this.page.waitForLoadState('networkidle');

		// Add additional wait to ensure backend processing completes
		// This helps with parallel test execution timing issues
		await this.page.waitForTimeout(200);
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
	 * Create a new document in current folder
	 */
	async createDocumentInFolder() {
		await this.createDocumentButton.click();
		await this.page.waitForURL(/\/new/);
	}

	/**
	 * Navigate to a subfolder - now uses sidebar navigation only
	 */
	async openSubFolder(folderName: string) {
		const folderButton = this.folderTree.getByRole('button', { name: `Open folder ${folderName}` });
		await folderButton.click();
		await this.waitForLoad();
	}

	/**
	 * Navigate to a document in the folder
	 */
	async openDocument(documentName: string) {
		const documentLink = this.documents.getByRole('link', { name: documentName });
		await documentLink.click();
		await this.waitForLoad();
	}

	/**
	 * Get list of subfolder names - now from sidebar only
	 */
	async getSubFolderNames(): Promise<string[]> {
		// Get folder names from sidebar tree by looking for "Open folder" buttons
		const folderButtons = this.folderTree.getByRole('button', { name: /^Open folder / });
		const ariaLabels = await folderButtons.evaluateAll((elements) =>
			elements.map((el) => el.getAttribute('aria-label') || '')
		);
		// Extract just the folder name from "Open folder [name]" aria-label
		return ariaLabels.map((label) => label.replace('Open folder ', ''));
	}

	/**
	 * Get list of document names in folder
	 */
	async getDocumentNames(): Promise<string[]> {
		const documentLinks = this.documents.locator('a');
		return await documentLinks.allTextContents();
	}

	/**
	 * Verify folder contains specific subfolder - now checks sidebar only
	 */
	async verifyContainsFolder(folderName: string) {
		const expandButtons = this.folderTree.getByRole('button').filter({ hasText: /expand folder/i });
		const expandCount = await expandButtons.count();

		for (let i = 0; i < expandCount; i++) {
			const expandButton = expandButtons.nth(i);
			if (await expandButton.isVisible()) {
				await expandButton.click();
				await this.page.waitForTimeout(300); // Wait for expansion
			}
		}

		const folderButton = this.folderTree.getByRole('button', {
			name: new RegExp(`Open folder ${folderName}`, 'i')
		});

		await this.page.waitForTimeout(500);
		await expect(folderButton.first()).toBeVisible({ timeout: 10000 });
	}

	/**
	 * Check if folder exists in sidebar (returns boolean)
	 */
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

	/**
	 * Verify folder contains specific document
	 */
	async verifyContainsDocument(documentName: string) {
		// Try more robust selectors first, fallback to text
		const documentByTestId = this.documents
			.getByTestId('document-item')
			.filter({ hasText: documentName });
		const documentByText = this.documents.getByText(documentName);

		// Check if we can find it by test ID first
		if (
			await documentByTestId
				.first()
				.isVisible()
				.catch(() => false)
		) {
			await expect(documentByTestId.first()).toBeVisible();
		} else {
			// Fallback to text-based search
			await expect(documentByText).toBeVisible();
		}
	}

	/**
	 * Find document by path attribute (more robust than text)
	 */
	async findDocumentByPath(documentPath: string) {
		return this.documents
			.locator(`[aria-label*="${documentPath}"]`)
			.or(this.documents.getByTestId('document-item').filter({ hasText: documentPath }));
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
		const documentCount = await this.documentItems.count();
		return folderCount + documentCount;
	}

	/**
	 * Count subfolders - now from sidebar only
	 */
	async getSubFolderCount(): Promise<number> {
		// Count folders in sidebar tree by looking for buttons with "Open folder" aria-label
		// These are the buttons that open folders, not documents
		const folderButtons = this.folderTree.getByRole('button', { name: /^Open folder / });
		return await folderButtons.count();
	}

	/**
	 * Count documents in folder
	 */
	async getDocumentCount(): Promise<number> {
		return await this.documentItems.count();
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
	 * Check if document creation is allowed
	 */
	async canCreateDocument(): Promise<boolean> {
		return await this.createDocumentButton.isVisible();
	}

	/**
	 * Legacy aliases for backwards compatibility
	 */
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

	// Legacy property aliases
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

import { test, expect } from '../fixtures/test-setup';

test.describe.serial('Folder Tree Creation', () => {
	const testFolderName = 'tree-test-folder';
	const cleanFolderName = 'tree-test-folder';

	test.beforeEach(async ({ apiHelper }) => {
		// Clean up any existing test folders
		await apiHelper.deleteFolder(`/${testFolderName}`).catch(() => {}); // Ignore if folder doesn't exist
	});

	test.afterEach(async ({ apiHelper }) => {
		// Clean up test folders after each test
		await apiHelper.deleteFolder(`/${testFolderName}`).catch(() => {}); // Ignore if folder doesn't exist
	});

	// test('should create folder via FolderTree context menu at root', async ({ folderPage, page }) => {
	// 	await folderPage.navigateToRoot();
	// 	await folderPage.verifyFolderLoaded();

	// 	// Find root folder in tree (usually represented as "/" or "Root")
	// 	const rootTreeItem = folderPage.folderTree.locator('[role="treeitem"]').first();
	// 	await expect(rootTreeItem).toBeVisible();

	// 	// Right-click on root folder to open context menu
	// 	await rootTreeItem.click({ button: 'right' });

	// 	// Look for context menu with "Create Subfolder" option
	// 	const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
	// 	await expect(contextMenu).toBeVisible({ timeout: 2000 });

	// 	const createSubfolderOption = contextMenu.getByText(/create.*subfolder|new.*folder/i);
	// 	await expect(createSubfolderOption).toBeVisible();
	// 	await createSubfolderOption.click();

	// 	// Should open the create folder modal
	// 	await folderPage.waitForVisible(folderPage.createFolderModal);

	// 	// Fill in folder name and create
	// 	await folderPage.fillInput(folderPage.folderNameInput, testFolderName);
	// 	await folderPage.confirmCreateFolder.click();

	// 	// Wait for modal to close and folder to be created
	// 	await page.waitForLoadState('networkidle');

	// 	// Verify folder appears in the main view
	// 	await folderPage.verifyContainsFolder(cleanFolderName);

	// 	// Verify folder appears in the tree sidebar
	// 	const sidebarFolder = folderPage.folderTree.getByText(cleanFolderName);
	// 	await expect(sidebarFolder).toBeVisible();
	// });

	test('should create folder via FolderTree context menu in nested folder', async ({
		folderPage,
		apiHelper,
		page
	}) => {
		// First create a parent folder to test nested creation
		await folderPage.navigateToRoot();
		await folderPage.createFolder('parent-tree-folder');
		await folderPage.verifyContainsFolder('parent-tree-folder');

		// Find the parent folder in the tree
		const parentTreeItem = folderPage.folderTree
			.locator('[data-testid="folder-tree-item"]')
			.filter({ hasText: 'parent-tree-folder' });
		await expect(parentTreeItem).toBeVisible();

		// Right-click on parent folder
		await parentTreeItem.click({ button: 'right' });

		// Look for context menu
		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const createSubfolderOption = contextMenu.getByText(/create.*subfolder|new.*folder/i);
		await expect(createSubfolderOption).toBeVisible();
		await createSubfolderOption.click();

		// Fill in nested folder name
		const nestedFolderName = 'nested-child';
		await folderPage.waitForVisible(folderPage.createFolderModal);
		await folderPage.fillInput(folderPage.folderNameInput, nestedFolderName);
		await folderPage.confirmCreateFolder.click();

		await page.waitForLoadState('networkidle');

		// Navigate to parent folder to verify child was created
		await folderPage.openSubFolder('parent-tree-folder');
		await folderPage.verifyContainsFolder(nestedFolderName);

		// Clean up nested structure
		await apiHelper.deleteFolder('/parent-tree-folder').catch(() => {});
	});

	test('should show context menu on folder tree items', async ({ folderPage, page }) => {
		await folderPage.navigateToRoot();

		// Create a test folder first
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(cleanFolderName);

		// Find the folder in the tree
		const folderTreeItem = folderPage.folderTree
			.locator('[data-testid="folder-tree-item"]')
			.filter({ hasText: cleanFolderName });
		await expect(folderTreeItem).toBeVisible();

		// Right-click should show context menu
		await folderTreeItem.click({ button: 'right' });

		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		// Context menu should have relevant options
		// (Implementation may vary, but should have some folder operations)
		const menuItems = contextMenu.locator('[role="menuitem"], button, a');
		const menuCount = await menuItems.count();
		expect(menuCount).toBeGreaterThan(0);

		// Click outside to close context menu
		await page.click('body', { position: { x: 10, y: 10 } });
		await expect(contextMenu).not.toBeVisible();
	});

	// test('should expand tree when creating nested folders', async ({ folderPage, page }) => {
	// 	await folderPage.navigateToRoot();

	// 	// Create a parent folder
	// 	await folderPage.createFolder('expandable-parent');
	// 	await folderPage.verifyContainsFolder('expandable-parent');

	// 	// The parent folder should appear in tree and be expandable
	// 	const parentInTree = folderPage.folderTree
	// 		.getByTestId('folder-tree-item')
	// 		.filter({ hasText: 'expandable-parent' });
	// 	await expect(parentInTree).toBeVisible();

	// 	// Navigate into the parent folder and create a child
	// 	await folderPage.openSubFolder('expandable-parent');
	// 	await folderPage.createFolder('child-folder');
	// 	await folderPage.verifyContainsFolder('child-folder');

	// 	// Verify the child folder exists via API before proceeding
	// 	const childFolderExists = await page.request.get(
	// 		'http://localhost:8081/api/folders/expandable-parent/child-folder'
	// 	);
	// 	expect(childFolderExists.ok()).toBe(true);

	// 	// Go back to root and verify tree structure
	// 	await folderPage.navigateToRoot();

	// 	// Wait for the tree to reload and show the parent folder has content
	// 	await page.waitForTimeout(2000);

	// 	// Find the parent folder again (re-locate after navigation)
	// 	const refreshedParentInTree = folderPage.folderTree
	// 		.getByTestId('folder-tree-item')
	// 		.filter({ hasText: 'expandable-parent' });
	// 	await expect(refreshedParentInTree).toBeVisible();

	// 	// Try to expand parent folder in tree to see child
	// 	await folderPage.expandTreeNode('expandable-parent');

	// 	// Wait for tree expansion and child folders to load
	// 	await page.waitForTimeout(2000);

	// 	// Child folder should now be visible in expanded tree
	// 	const childInTree = folderPage.folderTree
	// 		.getByTestId('folder-tree-item')
	// 		.filter({ hasText: 'child-folder' });
	// 	await expect(childInTree).toBeVisible({ timeout: 10000 });

	// 	// Clean up
	// 	await page.request
	// 		.delete(`http://localhost:8081/api/folders/expandable-parent`)
	// 		.catch(() => {});
	// });

	test('should handle context menu outside tree items gracefully', async ({ folderPage, page }) => {
		await folderPage.navigateToRoot();

		// Right-click on empty space in tree area (not on a folder)
		const treeContainer = folderPage.folderTree;
		await treeContainer.click({ button: 'right', position: { x: 5, y: 5 } });

		// Either no context menu should appear, or it should be a generic one
		// This test ensures we don't crash or show incorrect context menus
		// If a context menu appears, it shouldn't have folder-specific options
		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		// Wait briefly for context menu to potentially appear
		await contextMenu.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {
			// Context menu may not appear, which is fine
		});
		const isVisible = await contextMenu.isVisible().catch(() => false);

		if (isVisible) {
			// Should not have "Create Subfolder" option when not on a folder
			const createOption = contextMenu.getByText(/create.*subfolder/i);
			const hasCreateOption = await createOption.isVisible().catch(() => false);
			expect(hasCreateOption).toBe(false);
		}
	});
});

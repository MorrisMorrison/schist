import { test, expect } from '../fixtures';

test.describe.serial('Folder Tree Creation', () => {
	const testFolderName = 'tree-test-folder';
	const cleanFolderName = 'tree-test-folder';

	test('should create folder via FolderTree context menu in nested folder', async ({
		folderPage,
		apiHelper
	}) => {
		await folderPage.navigateToRoot();
		await folderPage.createFolder('parent-tree-folder');
		await folderPage.verifyContainsFolder('parent-tree-folder');

		const contextMenu = await folderPage.openContextMenu('parent-tree-folder');

		const createSubfolderOption = contextMenu.getByText(/create.*subfolder|new.*folder/i);
		await expect(createSubfolderOption).toBeVisible();
		await createSubfolderOption.click();

		const nestedFolderName = 'nested-child';
		await folderPage.waitForVisible(folderPage.createFolderModal);
		await folderPage.fillInput(folderPage.folderNameInput, nestedFolderName);
		await folderPage.confirmCreateFolder.click();
		await expect(folderPage.createFolderModal).toBeHidden();

		// The folder exists on the backend, nested under its parent...
		const parent = await apiHelper.getFolder('/parent-tree-folder');
		expect(parent.status).toBe(200);
		expect(JSON.stringify(parent.data)).toContain(`/parent-tree-folder/${nestedFolderName}`);

		// ...and shows up under the parent once it is expanded in the tree.
		await folderPage.expandTreeNode('parent-tree-folder');
		await folderPage.verifyContainsFolder(nestedFolderName);
	});

	test('should show context menu on folder tree items', async ({ folderPage, page }) => {
		await folderPage.navigateToRoot();

		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(cleanFolderName);

		const contextMenu = await folderPage.openContextMenu(cleanFolderName);

		// A regular folder offers rename and delete
		await expect(contextMenu.getByText(/rename/i)).toBeVisible();
		await expect(contextMenu.getByText(/delete/i)).toBeVisible();

		await page.click('body', { position: { x: 10, y: 10 } });
		await expect(contextMenu).not.toBeVisible();
	});

	test('should show context menu on root folder in tree', async ({ folderPage, page }) => {
		await folderPage.navigateToRoot();

		// Look for the root folder node (which should show as "/" when showPages is enabled)
		const rootFolderTreeItem = folderPage.folderTree
			.locator('[data-testid="folder-tree-item"]')
			.filter({ hasText: '/' })
			.first();

		// If root folder item is not visible, we might need to look for it differently
		// Check if it exists, and if not, just use the first tree item which should be root
		const rootItemVisible = await rootFolderTreeItem.isVisible().catch(() => false);
		let rootItem = rootFolderTreeItem;
		if (!rootItemVisible) {
			// Fallback to first tree item if specific root item not found
			rootItem = folderPage.folderTree.locator('[data-testid="folder-tree-item"]').first();
		}

		await expect(rootItem).toBeVisible();

		// Right-click on the root folder item
		await rootItem.click({ button: 'right' });

		// Verify context menu appears
		const contextMenu = folderPage.contextMenu;
		await expect(contextMenu).toBeVisible();

		// Verify menu has expected options for root folder
		const createSubfolderOption = contextMenu.getByText(/create.*subfolder|new.*folder/i);
		const createDocumentOption = contextMenu.getByText(/create.*document|new.*document/i);
		const exportOption = contextMenu.getByText(/export/i);

		await expect(createSubfolderOption).toBeVisible();
		await expect(createDocumentOption).toBeVisible();
		await expect(exportOption).toBeVisible();

		// Verify that rename and delete options are NOT present for root folder
		await expect(contextMenu.getByText(/rename/i)).toHaveCount(0);
		await expect(contextMenu.getByText(/delete/i)).toHaveCount(0);

		// Close context menu by clicking elsewhere
		await page.click('body', { position: { x: 10, y: 10 } });
		await expect(contextMenu).not.toBeVisible();
	});

	test('should handle context menu outside tree items gracefully', async ({ folderPage, page }) => {
		await folderPage.navigateToRoot();

		await page.click('body');

		const sidebar = page.locator('[data-testid="sidebar"]').or(page.locator('aside')).first();
		const treeContainer = folderPage.folderTree;

		const treeBox = await treeContainer.boundingBox();
		const sidebarBox = await sidebar.boundingBox();

		if (treeBox && sidebarBox) {
			const clickY = Math.max(5, treeBox.y - sidebarBox.y - 10);
			const clickX = 10;

			await sidebar.click({
				button: 'right',
				position: { x: clickX, y: clickY }
			});
		} else {
			await treeContainer.click({ button: 'right', position: { x: 5, y: 5 } });
		}

		// The menu renders synchronously on the contextmenu event, so had it
		// opened it would already be in the DOM once the right-click resolves.
		await expect(folderPage.contextMenu).toBeHidden();
	});
});

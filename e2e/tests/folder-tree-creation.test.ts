import { test, expect } from '../fixtures';

test.describe.serial('Folder Tree Creation', () => {
	const testFolderName = 'tree-test-folder';

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
		await folderPage.submitCreateFolder(nestedFolderName);

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
		await folderPage.verifyContainsFolder(testFolderName);

		const contextMenu = await folderPage.openContextMenu(testFolderName);

		// A regular folder offers rename and delete
		await expect(contextMenu.getByText(/rename/i)).toBeVisible();
		await expect(contextMenu.getByText(/delete/i)).toBeVisible();

		await page.click('body', { position: { x: 10, y: 10 } });
		await expect(contextMenu).not.toBeVisible();
	});

	test('should create a top-level folder from the sidebar + menu', async ({ folderPage, page }) => {
		await folderPage.navigateToRoot();

		// The sidebar has no root row any more; top-level actions live in its "+" menu.
		await expect(
			folderPage.folderTree.getByRole('button', { name: 'Open folder /', exact: true })
		).toHaveCount(0);

		await page.getByTestId('sidebar-new-menu').click();
		await expect(page.getByRole('menuitem', { name: 'New page' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Import documents' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Export all' })).toBeVisible();
		await page.getByRole('menuitem', { name: 'New folder' }).click();

		const folderName = 'top-level-from-menu';
		await folderPage.submitCreateFolder(folderName);

		await folderPage.verifyContainsFolder(folderName);
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

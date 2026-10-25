import { test, expect } from '../fixtures';

test.describe.serial('Folder Rename and Delete', () => {
	const testFolderName = 'rename-delete-test';
	const renamedFolderName = 'renamed-folder';

	test('should rename folder via context menu', async ({ folderPage, page }) => {
		// Create test folder first
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		const contextMenu = await folderPage.openContextMenu(testFolderName);
		await contextMenu.getByText(/rename/i).click();

		// The rename modal opens prefilled with the current name
		const renameInput = page.getByTestId('folder-name');
		await expect(renameInput).toBeVisible();
		await renameInput.fill(renamedFolderName);

		await page.getByTestId('rename-folder-btn').click();
		await expect(renameInput).toBeHidden();

		// Verify folder was renamed and the old name is gone
		await folderPage.verifyContainsFolder(renamedFolderName);
		await folderPage.verifyFolderNotInTree(testFolderName);

		// Verify renamed folder is functional
		await folderPage.openSubFolder(renamedFolderName);
		await folderPage.verifyFolderLoaded(renamedFolderName);
	});

	test('should delete empty folder via context menu', async ({ folderPage, page }) => {
		// Create test folder
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		// Get initial folder count
		const initialCount = await folderPage.getSubFolderCount();

		const contextMenu = await folderPage.openContextMenu(testFolderName);
		await contextMenu.getByText(/delete/i).click();

		// Handle confirmation dialog - it should appear
		const confirmDialog = page.getByTestId('confirm-dialog');
		await expect(confirmDialog).toBeVisible();
		await confirmDialog.getByTestId('confirm-delete-button').click();
		await expect(confirmDialog).toBeHidden();

		// Wait for the folder to be removed from the sidebar tree
		await folderPage.verifyFolderNotInTree(testFolderName);

		// Verify folder count decreased
		const newCount = await folderPage.getSubFolderCount();
		expect(newCount).toBe(initialCount - 1);
	});

	test('should delete folder with content', async ({ folderPage, page, apiHelper, testId }) => {
		// Create test folder with content
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		// Navigate into folder and create a page
		await folderPage.openSubFolder(testFolderName);
		await folderPage.verifyFolderLoaded(testFolderName);

		// Create a page inside the folder via API for reliability
		const testDocument = await apiHelper.seedDocument({
			title: `Test Page ${testId}`,
			content: '# Test Page\n\nContent in folder to be deleted.',
			path: `/${testFolderName}/test-page-${testId}`,
			tags: []
		});

		// Refresh to see the new page
		await page.reload();
		await folderPage.verifyFolderLoaded(testFolderName);
		await folderPage.verifyContainsDocument(testDocument.title);

		// Go back to root
		await folderPage.navigateToRoot();

		// Delete folder with content; a non-empty folder asks for confirmation too
		const contextMenu = await folderPage.openContextMenu(testFolderName);
		await contextMenu.getByText(/delete/i).click();

		const confirmDialog = page.getByTestId('confirm-dialog');
		await expect(confirmDialog).toBeVisible();
		await expect(confirmDialog).toContainText(/delete/i);
		await confirmDialog.getByTestId('confirm-delete-button').click();
		await expect(confirmDialog).toBeHidden();

		// The folder is gone from the sidebar...
		await folderPage.verifyFolderNotInTree(testFolderName);

		// ...and so is its content. Folder delete removes the directory outright
		// (unlike document delete, it does not move anything to /trash).
		const documentAfterDelete = await apiHelper.request('GET', `/documents${testDocument.path}`);
		expect(documentAfterDelete.status).toBe(404);
	});

	test('should cancel folder deletion', async ({ folderPage, page }) => {
		// Create test folder
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		const initialCount = await folderPage.getSubFolderCount();

		// Open context menu and select delete
		const contextMenu = await folderPage.openContextMenu(testFolderName);
		await contextMenu.getByText(/delete/i).click();

		// Cancel the confirmation dialog
		const confirmDialog = page.getByTestId('confirm-dialog');
		await expect(confirmDialog).toBeVisible();
		await confirmDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(confirmDialog).toBeHidden();

		// Verify folder still exists
		await folderPage.verifyContainsFolder(testFolderName);

		const finalCount = await folderPage.getSubFolderCount();
		expect(finalCount).toBe(initialCount);
	});

	test('should handle rename validation errors', async ({ folderPage, page }) => {
		// Create test folder
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		// Try to rename with invalid name
		const contextMenu = await folderPage.openContextMenu(testFolderName);
		await contextMenu.getByText(/rename/i).click();

		const renameInput = page.getByTestId('folder-name');
		await expect(renameInput).toBeVisible();

		// Characters outside [a-zA-Z0-9-_ ] are rejected client-side
		await renameInput.fill('invalid/folder*name!');
		await expect(page.getByTestId('rename-folder-btn')).toBeDisabled();

		// Cancel the operation
		await page.getByTestId('cancel-rename-folder-btn').click();
		await expect(renameInput).toBeHidden();

		// Verify original folder name unchanged
		await folderPage.verifyContainsFolder(testFolderName);
	});

	test('should prevent renaming to duplicate folder name', async ({ folderPage, page }) => {
		// Create two test folders
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.createFolder(renamedFolderName);
		await folderPage.verifyContainsFolder(testFolderName);
		await folderPage.verifyContainsFolder(renamedFolderName);

		// Try to rename first folder to same name as second
		const contextMenu = await folderPage.openContextMenu(testFolderName);
		await contextMenu.getByText(/rename/i).click();

		const renameInput = page.getByTestId('folder-name');
		await expect(renameInput).toBeVisible();
		await renameInput.fill(renamedFolderName);

		// The name is syntactically valid, so the request is sent -- and refused.
		const renameResponse = page.waitForResponse(
			(response) =>
				response.request().method() === 'PUT' &&
				new URL(response.url()).pathname.includes('/api/folders/')
		);
		await page.getByTestId('rename-folder-btn').click();
		expect((await renameResponse).ok()).toBe(false);

		// The modal stays open on error; cancel it
		await page.getByTestId('cancel-rename-folder-btn').click();
		await expect(renameInput).toBeHidden();

		// Verify both folders still exist with original names
		await folderPage.verifyContainsFolder(testFolderName);
		await folderPage.verifyContainsFolder(renamedFolderName);
	});
});

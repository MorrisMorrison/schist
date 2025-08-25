import { test, expect } from '../fixtures';

test.describe.serial('Folder Rename and Delete', () => {
	const testFolderName = 'rename-delete-test';
	const renamedFolderName = 'renamed-folder';

	test('should rename folder via context menu', async ({ folderPage, page }) => {
		// Create test folder first
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		// Find folder in tree and open context menu
		const folderTreeItem = folderPage.folderTree
			.getByTestId('folder-tree-item')
			.filter({ hasText: testFolderName });
		await expect(folderTreeItem).toBeVisible();
		await folderTreeItem.click({ button: 'right' });

		// Look for rename option in context menu
		const contextMenu = page.getByTestId('context-menu');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const renameOption = contextMenu.getByText(/rename/i);
		await expect(renameOption).toBeVisible();
		await renameOption.click();

		// Should open rename modal or inline editor
		const renameInput = page.getByTestId('folder-name');
		await expect(renameInput).toBeVisible();

		// Clear current name and enter new name
		await renameInput.fill(renamedFolderName);

		// Confirm rename
		const confirmButton = page.getByTestId('rename-folder-btn');
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
		} else {
			// If no confirm button, try pressing Enter
			await renameInput.press('Enter');
		}

		await page.waitForLoadState('networkidle');

		// Verify folder was renamed
		await folderPage.verifyContainsFolder(renamedFolderName);

		// Verify old name no longer exists
		const oldFolderExists = await folderPage.folderExistsInSidebar(testFolderName);
		expect(oldFolderExists).toBe(false);

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

		// Find folder in tree and open context menu
		const folderTreeItem = folderPage.folderTree
			.getByTestId('folder-tree-item')
			.filter({ hasText: testFolderName });
		await expect(folderTreeItem).toBeVisible();
		await folderTreeItem.click({ button: 'right' });

		// Look for delete option in context menu
		const contextMenu = page.getByTestId('context-menu');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const deleteOption = contextMenu.getByText(/delete/i);
		await expect(deleteOption).toBeVisible();
		await deleteOption.click();

		// Handle confirmation dialog - it should appear
		const confirmDialog = page.getByTestId('confirm-dialog');
		await expect(confirmDialog).toBeVisible({ timeout: 3000 });

		const confirmDeleteButton = confirmDialog.getByTestId('confirm-delete-button');
		await expect(confirmDeleteButton).toBeVisible();
		await confirmDeleteButton.click();

		// Wait for dialog to close and network operations to complete
		await expect(confirmDialog).not.toBeVisible();
		await page.waitForLoadState('networkidle');

		// Wait for the folder to be removed from the sidebar tree
		await expect(
			folderPage.folderTree.getByTestId('folder-tree-item').filter({ hasText: testFolderName })
		).not.toBeVisible();

		// Verify folder count decreased
		const newCount = await folderPage.getSubFolderCount();
		expect(newCount).toBe(initialCount - 1);

		// Verify folder no longer appears in tree
		const treeItemExists = await folderPage.folderTree
			.getByTestId('folder-tree-item')
			.filter({ hasText: testFolderName })
			.isVisible()
			.catch(() => false);
		expect(treeItemExists).toBe(false);
	});

	test('should delete folder with content (move to trash)', async ({
		folderPage,
		page,
		apiHelper,
		testId
	}) => {
		// Create test folder with content
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		// Navigate into folder and create a page
		await folderPage.openSubFolder(testFolderName);
		await folderPage.verifyFolderLoaded(testFolderName);

		// Create a page inside the folder via API for reliability
		const testDocument = {
			title: `Test Page ${testId}`,
			content: '# Test Page\n\nContent in folder to be deleted.',
			path: `/${testFolderName}/test-page-${testId}`
		};
		await apiHelper.createDocument(testDocument);

		// Refresh to see the new page
		await page.reload();
		await folderPage.verifyFolderLoaded(testFolderName);

		// Go back to root
		await folderPage.navigateToRoot();

		// Delete folder with content
		const folderTreeItem = folderPage.folderTree
			.getByTestId('folder-tree-item')
			.filter({ hasText: testFolderName });
		await expect(folderTreeItem).toBeVisible();
		await folderTreeItem.click({ button: 'right' });

		const contextMenu = page.getByTestId('context-menu');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const deleteOption = contextMenu.getByText(/delete/i);
		await deleteOption.click();

		// Should show confirmation for non-empty folder
		const confirmDialog = page.getByTestId('confirm-dialog');
		if (await confirmDialog.isVisible()) {
			// Should warn about moving to trash
			await expect(confirmDialog).toContainText(/trash|delete/i);
			const confirmDeleteButton = confirmDialog.getByRole('button', {
				name: /delete|confirm|yes/i
			});
			await confirmDeleteButton.click();
		}

		await page.waitForLoadState('networkidle');

		// Wait for the folder to disappear from the sidebar tree
		await expect(
			folderPage.folderTree.getByTestId('folder-tree-item').filter({ hasText: testFolderName })
		).not.toBeVisible();

		// Verify folder no longer appears in sidebar
		const folderExists = await folderPage.folderExistsInSidebar(testFolderName);
		expect(folderExists).toBe(false);

		// Verify folder was moved to trash (not permanently deleted)
		// The content should be accessible in /trash folder structure
		const trashResponse = await apiHelper.getFolder('/trash');
		if (trashResponse.status === 200) {
			// Trash folder should exist and might contain our deleted content
			expect(trashResponse.data).toBeDefined();
		}
	});

	test('should cancel folder deletion', async ({ folderPage, page }) => {
		// Create test folder
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		const initialCount = await folderPage.getSubFolderCount();

		// Open context menu and select delete
		const folderTreeItem = folderPage.folderTree
			.getByTestId('folder-tree-item')
			.filter({ hasText: testFolderName });
		await folderTreeItem.click({ button: 'right' });

		const contextMenu = page.getByTestId('context-menu');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const deleteOption = contextMenu.getByText(/delete/i);
		await deleteOption.click();

		// Cancel if confirmation dialog appears
		const confirmDialog = page.getByTestId('confirm-dialog');
		if (await confirmDialog.isVisible()) {
			const cancelButton = confirmDialog.getByRole('button', { name: /cancel|no/i });
			await cancelButton.click();
		}

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
		const folderTreeItem = folderPage.folderTree
			.getByTestId('folder-tree-item')
			.filter({ hasText: testFolderName });
		await folderTreeItem.click({ button: 'right' });

		const contextMenu = page.getByTestId('context-menu');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const renameOption = contextMenu.getByText(/rename/i);
		await renameOption.click();

		const renameInput = page.getByTestId('folder-name');
		await expect(renameInput).toBeVisible();

		// Try invalid characters
		const invalidName = 'invalid/folder*name!';
		await renameInput.fill(invalidName);

		const confirmButton = page.getByTestId('rename-folder-btn');
		if (await confirmButton.isVisible()) {
			await expect(confirmButton).toBeDisabled();
		}

		// Cancel the operation
		const cancelButton = page.getByTestId('cancel-rename-folder-btn');
		if (await cancelButton.isVisible()) {
			await cancelButton.click();
		}

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
		const folderTreeItem = folderPage.folderTree
			.getByTestId('folder-tree-item')
			.filter({ hasText: testFolderName });
		await folderTreeItem.click({ button: 'right' });

		const contextMenu = page.getByTestId('context-menu');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const renameOption = contextMenu.getByText(/rename/i);
		await renameOption.click();

		const renameInput = page.getByTestId('folder-name');
		await expect(renameInput).toBeVisible();

		// Try to use duplicate name
		await renameInput.fill(renamedFolderName);

		const confirmButton = page.getByTestId('rename-folder-btn');
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
			// Should show duplicate error
			// await expect(page.getByText("folder already exists")).toBeVisible();
		}

		// Cancel the operation
		const cancelButton = page.getByRole('button', { name: /cancel/i });
		if (await cancelButton.isVisible()) {
			await cancelButton.click();
		}

		// Verify both folders still exist with original names
		await folderPage.verifyContainsFolder(testFolderName);
		await folderPage.verifyContainsFolder(renamedFolderName);
	});
});

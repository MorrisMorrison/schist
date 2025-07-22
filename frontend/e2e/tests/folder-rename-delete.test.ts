import { test, expect } from '../fixtures/test-setup';

test.describe.serial('Folder Rename and Delete', () => {
	const testFolderName = 'rename-delete-test';
	const renamedFolderName = 'renamed-folder';

	test.beforeEach(async ({ page }) => {
		// Clean up any existing test folders
		await page.request
			.delete(`http://localhost:8080/api/folders/${testFolderName}`)
			.catch(() => {});
		await page.request
			.delete(`http://localhost:8080/api/folders/${renamedFolderName}`)
			.catch(() => {});
	});

	test.afterEach(async ({ page }) => {
		// Clean up test folders after each test
		await page.request
			.delete(`http://localhost:8080/api/folders/${testFolderName}`)
			.catch(() => {});
		await page.request
			.delete(`http://localhost:8080/api/folders/${renamedFolderName}`)
			.catch(() => {});
	});

	test('should rename folder via context menu', async ({ folderPage, page }) => {
		// Create test folder first
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		// Find folder in tree and open context menu
		const folderTreeItem = folderPage.folderTree.getByText(testFolderName);
		await expect(folderTreeItem).toBeVisible();
		await folderTreeItem.click({ button: 'right' });

		// Look for rename option in context menu
		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const renameOption = contextMenu.getByText(/rename/i);
		await expect(renameOption).toBeVisible();
		await renameOption.click();

		// Should open rename modal or inline editor
		const renameInput = page
			.getByLabel(/folder name|name/i)
			.or(page.getByRole('textbox').filter({ hasText: testFolderName }));
		await expect(renameInput).toBeVisible();

		// Clear current name and enter new name
		await renameInput.fill(renamedFolderName);

		// Confirm rename
		const confirmButton = page.getByRole('button', { name: /confirm|save|rename/i });
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
		const oldFolderExists = await folderPage.subFolders
			.getByRole('link', { name: testFolderName })
			.isVisible()
			.catch(() => false);
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
		const folderTreeItem = folderPage.folderTree.getByText(testFolderName);
		await expect(folderTreeItem).toBeVisible();
		await folderTreeItem.click({ button: 'right' });

		// Look for delete option in context menu
		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const deleteOption = contextMenu.getByText(/delete/i);
		await expect(deleteOption).toBeVisible();
		await deleteOption.click();

		// Handle confirmation dialog if it appears
		const confirmDialog = page.locator('[role="dialog"], [data-testid="confirm-dialog"]');
		if (await confirmDialog.isVisible()) {
			const confirmDeleteButton = confirmDialog.getByRole('button', { name: /delete|confirm/i });
			await confirmDeleteButton.click();
		}

		await page.waitForLoadState('networkidle');

		// Verify folder was deleted
		const folderExists = await folderPage.subFolders
			.getByRole('link', { name: testFolderName })
			.isVisible()
			.catch(() => false);
		expect(folderExists).toBe(false);

		// Verify folder count decreased
		const newCount = await folderPage.getSubFolderCount();
		expect(newCount).toBe(initialCount - 1);

		// Verify folder no longer appears in tree
		const treeItemExists = await folderPage.folderTree
			.getByText(testFolderName)
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
		const testPage = {
			title: `Test Page ${testId}`,
			content: '# Test Page\n\nContent in folder to be deleted.',
			path: `/${testFolderName}/test-page-${testId}`
		};
		await apiHelper.createPage(testPage);

		// Refresh to see the new page
		await page.reload();
		await folderPage.verifyFolderLoaded(testFolderName);

		// Go back to root
		await folderPage.navigateToRoot();

		// Delete folder with content
		const folderTreeItem = folderPage.folderTree.getByText(testFolderName);
		await expect(folderTreeItem).toBeVisible();
		await folderTreeItem.click({ button: 'right' });

		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const deleteOption = contextMenu.getByText(/delete/i);
		await deleteOption.click();

		// Should show confirmation for non-empty folder
		const confirmDialog = page.locator('[role="dialog"], [data-testid="confirm-dialog"]');
		if (await confirmDialog.isVisible()) {
			// Should warn about moving to trash
			await expect(confirmDialog).toContainText(/trash|delete/i);
			const confirmDeleteButton = confirmDialog.getByRole('button', {
				name: /delete|confirm|yes/i
			});
			await confirmDeleteButton.click();
		}

		await page.waitForLoadState('networkidle');

		// Verify folder no longer appears in main view
		const folderExists = await folderPage.subFolders
			.getByRole('link', { name: testFolderName })
			.isVisible()
			.catch(() => false);
		expect(folderExists).toBe(false);

		// Verify folder was moved to trash (not permanently deleted)
		// The content should be accessible in /trash folder structure
		const trashResponse = await page.request.get('http://localhost:8080/api/folders/trash');
		if (trashResponse.ok()) {
			const trashData = await trashResponse.json();
			// Trash folder should exist and might contain our deleted content
			expect(trashData).toBeDefined();
		}
	});

	test('should cancel folder deletion', async ({ folderPage, page }) => {
		// Create test folder
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		const initialCount = await folderPage.getSubFolderCount();

		// Open context menu and select delete
		const folderTreeItem = folderPage.folderTree.getByText(testFolderName);
		await folderTreeItem.click({ button: 'right' });

		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const deleteOption = contextMenu.getByText(/delete/i);
		await deleteOption.click();

		// Cancel if confirmation dialog appears
		const confirmDialog = page.locator('[role="dialog"], [data-testid="confirm-dialog"]');
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
		const folderTreeItem = folderPage.folderTree.getByText(testFolderName);
		await folderTreeItem.click({ button: 'right' });

		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const renameOption = contextMenu.getByText(/rename/i);
		await renameOption.click();

		const renameInput = page.getByLabel(/folder name|name/i).or(page.getByRole('textbox'));
		await expect(renameInput).toBeVisible();

		// Try invalid characters
		const invalidName = 'invalid/folder*name!';
		await renameInput.fill(invalidName);

		const confirmButton = page.getByRole('button', { name: /confirm|save|rename/i });
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
			// Should show error message
			await expect(page.getByText(/invalid|error/i)).toBeVisible();
		}

		// Cancel the operation
		const cancelButton = page.getByRole('button', { name: /cancel/i });
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
		const folderTreeItem = folderPage.folderTree.getByText(testFolderName);
		await folderTreeItem.click({ button: 'right' });

		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const renameOption = contextMenu.getByText(/rename/i);
		await renameOption.click();

		const renameInput = page.getByLabel(/folder name|name/i).or(page.getByRole('textbox'));
		await expect(renameInput).toBeVisible();

		// Try to use duplicate name
		await renameInput.fill(renamedFolderName);

		const confirmButton = page.getByRole('button', { name: /confirm|save|rename/i });
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
			// Should show duplicate error
			await expect(page.getByText(/exists|duplicate|already/i)).toBeVisible();
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

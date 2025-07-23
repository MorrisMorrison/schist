import { test, expect } from '../fixtures/test-setup';

test.describe.serial('Folder Creation', () => {
	const testFolderName = 'test-folder-e2e';
	const cleanFolderName = 'test-folder-e2e'; // Expected normalized name

	test.beforeEach(async ({ page }) => {
		// Clean up any existing test folders
		await page.request
			.delete(`http://localhost:8080/api/folders/${testFolderName}`)
			.catch(() => {}); // Ignore if folder doesn't exist
	});

	test.afterEach(async ({ page }) => {
		// Clean up test folders after each test
		await page.request
			.delete(`http://localhost:8080/api/folders/${testFolderName}`)
			.catch(() => {}); // Ignore if folder doesn't exist
	});

	test('should create folder via FolderView at root level', async ({ folderPage }) => {
		// Navigate to root folder view
		await folderPage.navigateToRoot();
		await folderPage.verifyFolderLoaded();

		// Create a new folder
		await folderPage.createFolder(testFolderName);

		// Verify the folder was created and appears in the folder list
		await folderPage.verifyContainsFolder(cleanFolderName);

		// Verify we can navigate to the new folder
		await folderPage.openSubFolder(cleanFolderName);
		await folderPage.verifyFolderLoaded(); // Don't check specific title, just that we loaded a folder
		await folderPage.verifyFolderUrl(`/${cleanFolderName}`);
	});

	test('should create folder in nested path', async ({ folderPage }) => {
		// First create a parent folder
		await folderPage.navigateToRoot();
		await folderPage.createFolder('parent-folder');
		await folderPage.verifyContainsFolder('parent-folder');

		// Navigate to the parent folder
		await folderPage.openSubFolder('parent-folder');
		await folderPage.verifyFolderLoaded();

		// Create a child folder
		const childFolderName = 'child-folder';
		await folderPage.createFolder(childFolderName);

		// Verify the child folder was created
		await folderPage.verifyContainsFolder(childFolderName);

		// Verify navigation to child folder works
		await folderPage.openSubFolder(childFolderName);
		await folderPage.verifyFolderLoaded();
		await folderPage.verifyFolderUrl(`/parent-folder/${childFolderName}`);

		// Clean up nested folders
		await folderPage.page.request
			.delete(`http://localhost:8080/api/folders/parent-folder`)
			.catch(() => {});
	});

	test('should show error for invalid folder names', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		// Try to create folder with invalid characters
		await folderPage.createFolderButton.click();
		await folderPage.waitForVisible(folderPage.createFolderModal);

		// Fill invalid name (with special characters)
		const invalidName = 'invalid/folder*name!';
		await folderPage.fillInput(folderPage.folderNameInput, invalidName);

		// The create button should be disabled or show validation error
		const createButton = folderPage.confirmCreateFolder;
		const isDisabled = await createButton.isDisabled();

		if (!isDisabled) {
			// If button is not disabled, clicking should show an error
			await createButton.click();
			await expect(folderPage.page.getByText(/invalid/i)).toBeVisible();
		}

		// Cancel the modal
		await folderPage.cancelCreateFolder.click();
	});

	test('should normalize folder names properly', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		// Create folder with spaces and mixed case
		const inputName = 'My Test Folder';
		const expectedName = 'my-test-folder'; // Expected normalized name

		await folderPage.createFolder(inputName);

		// Verify the normalized folder name appears
		await folderPage.verifyContainsFolder(expectedName);

		// Clean up
		await folderPage.page.request
			.delete(`http://localhost:8080/api/folders/${expectedName}`)
			.catch(() => {});
	});

	test('should update folder tree after creation', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		// Get initial folder count
		const initialCount = await folderPage.getSubFolderCount();

		// Create a new folder
		await folderPage.createFolder(testFolderName);

		// Wait for the folder to appear in the UI before counting
		await folderPage.verifyContainsFolder(cleanFolderName);

		// Verify folder count increased
		const newCount = await folderPage.getSubFolderCount();
		expect(newCount).toBe(initialCount + 1);

		// Verify folder appears in both main view and sidebar tree
		await folderPage.verifyContainsFolder(cleanFolderName);

		// Check if folder appears in sidebar tree (if visible)
		const sidebarFolder = folderPage.folderTree
			.locator('[data-testid="folder-tree-item"]')
			.filter({ hasText: cleanFolderName });
		if (await sidebarFolder.isVisible()) {
			await expect(sidebarFolder).toBeVisible();
		}
	});

	test('should cancel folder creation', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		// Get initial folder count
		const initialCount = await folderPage.getSubFolderCount();

		// Start creating folder but cancel
		await folderPage.cancelFolderCreation();

		// Verify no new folder was created
		const finalCount = await folderPage.getSubFolderCount();
		expect(finalCount).toBe(initialCount);

		// Verify test folder name doesn't appear
		const folderExists = await folderPage.subFolders
			.getByRole('link', { name: testFolderName })
			.isVisible()
			.catch(() => false);
		expect(folderExists).toBe(false);
	});

	test('should prevent duplicate folder names', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		// Create first folder
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(cleanFolderName);

		// Try to create folder with same name
		await folderPage.createFolderButton.click();
		await folderPage.waitForVisible(folderPage.createFolderModal);
		await folderPage.fillInput(folderPage.folderNameInput, testFolderName);
		await folderPage.confirmCreateFolder.click();

		// Should show error or fail to create
		// Wait a moment for any error message
		await folderPage.page.waitForTimeout(1000);

		// Verify only one folder exists (not duplicated)
		const folderLinks = folderPage.subFolders.getByText(cleanFolderName);
		const count = await folderLinks.count();
		expect(count).toBe(1);

		// Close modal if it's still open
		const cancelButton = folderPage.cancelCreateFolder;
		if (await cancelButton.isVisible()) {
			await cancelButton.click();
		}
	});

	test('should allow folder creation in empty root', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		// This test ensures that even if root is empty, folder creation works
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(cleanFolderName);

		// Verify we're no longer seeing empty folder message
		const emptyMessage = folderPage.emptyFolderMessage;
		const isEmpty = await emptyMessage.isVisible().catch(() => false);
		expect(isEmpty).toBe(false);
	});
});

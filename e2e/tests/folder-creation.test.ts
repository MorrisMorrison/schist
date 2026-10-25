import { test, expect } from '../fixtures';

test.describe.serial('Folder Creation', () => {
	const testFolderName = 'test-folder-e2e';

	// Ensure clean state before each test in this describe block
	test.beforeEach(async ({ apiHelper }) => {
		await apiHelper.cleanupTestData();
	});

	test('should create folder via FolderView at root level', async ({ folderPage }) => {
		await folderPage.navigateToRoot();
		await folderPage.verifyFolderLoaded();

		await folderPage.createFolder(testFolderName);

		await folderPage.verifyContainsFolder(testFolderName);

		await folderPage.openSubFolder(testFolderName);
		await folderPage.verifyFolderLoaded();
		await folderPage.verifyFolderUrl(`/${testFolderName}`);
	});

	test('should show error for invalid folder names', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		await folderPage.openCreateFolderModal();

		const invalidName = 'invalid/folder*name!';
		await folderPage.fillInput(folderPage.folderNameInput, invalidName);

		// Characters outside [a-zA-Z0-9-_ ] are rejected client-side
		await expect(folderPage.confirmCreateFolder).toBeDisabled();

		await folderPage.cancelCreateFolder.click();
		await expect(folderPage.createFolderModal).toBeHidden();
	});

	test('should normalize folder names properly', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		const inputName = 'My Test Folder';
		const expectedName = 'my-test-folder';

		await folderPage.createFolder(inputName);

		await folderPage.verifyContainsFolder(expectedName);
	});

	test('should update folder tree after creation', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		const initialCount = await folderPage.getSubFolderCount();
		const uniqueTestFolderName = 'tree-update-test-folder';

		await folderPage.createFolder(uniqueTestFolderName);

		await folderPage.verifyContainsFolder(uniqueTestFolderName);

		const newCount = await folderPage.getSubFolderCount();
		expect(newCount).toBe(initialCount + 1);

		await expect(folderPage.treeItem(uniqueTestFolderName)).toBeVisible();
	});

	test('should cancel folder creation', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		const initialCount = await folderPage.getSubFolderCount();
		const cancelTestFolderName = 'cancel-test-folder';

		// Open folder creation modal and cancel it
		await folderPage.openCreateFolderModal();
		await folderPage.fillInput(folderPage.folderNameInput, cancelTestFolderName);
		await folderPage.cancelCreateFolder.click();
		await expect(folderPage.createFolderModal).toBeHidden();

		// Verify folder count hasn't changed
		const finalCount = await folderPage.getSubFolderCount();
		expect(finalCount).toBe(initialCount);

		// Verify the specific folder we tried to create doesn't exist
		await folderPage.verifyFolderNotInTree(cancelTestFolderName);
	});

	test('should prevent duplicate folder names', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		await folderPage.createFolder(testFolderName);

		// Creating an existing folder is idempotent: still exactly one in the tree
		await expect(folderPage.folderButton(testFolderName)).toHaveCount(1);
	});

	test('should allow folder creation in empty root', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		const emptyRootTestFolderName = 'empty-root-test-folder';
		await folderPage.createFolder(emptyRootTestFolderName);
		await folderPage.verifyContainsFolder(emptyRootTestFolderName);

		// Root should be empty (showing empty message) after proper cleanup from previous tests
		// Creating folders doesn't add documents, so empty message should still be visible
		await expect(folderPage.emptyFolderMessage).toBeVisible();
	});
});

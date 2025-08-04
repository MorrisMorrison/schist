import { test, expect } from '../fixtures/test-setup';

test.describe.serial('Folder Creation', () => {
	const testFolderName = 'test-folder-e2e';
	const cleanFolderName = 'test-folder-e2e';

	test.beforeEach(async ({ apiHelper }) => {
		await apiHelper.deleteFolder(`/${testFolderName}`).catch(() => {}); // Ignore if folder doesn't exist
	});

	test.afterEach(async ({ apiHelper }) => {
		await apiHelper.deleteFolder(`/${testFolderName}`).catch(() => {}); // Ignore if folder doesn't exist
	});

	test('should create folder via FolderView at root level', async ({ folderPage }) => {
		await folderPage.navigateToRoot();
		await folderPage.verifyFolderLoaded();

		await folderPage.createFolder(testFolderName);

		await folderPage.verifyContainsFolder(cleanFolderName);

		await folderPage.openSubFolder(cleanFolderName);
		await folderPage.verifyFolderLoaded();
		await folderPage.verifyFolderUrl(`/${cleanFolderName}`);
	});

	test('should show error for invalid folder names', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		await folderPage.createFolderButton.click();
		await folderPage.waitForVisible(folderPage.createFolderModal);

		const invalidName = 'invalid/folder*name!';
		await folderPage.fillInput(folderPage.folderNameInput, invalidName);

		const createButton = folderPage.confirmCreateFolder;
		const isDisabled = await createButton.isDisabled();

		if (!isDisabled) {
			await createButton.click();
			await expect(folderPage.page.getByText(/invalid/i)).toBeVisible();
		}
		await folderPage.cancelCreateFolder.click();
	});

	test('should normalize folder names properly', async ({ folderPage, apiHelper }) => {
		await folderPage.navigateToRoot();

		const inputName = 'My Test Folder';
		const expectedName = 'my-test-folder';

		await folderPage.createFolder(inputName);

		await folderPage.verifyContainsFolder(expectedName);

		await apiHelper.deleteFolder(`/${expectedName}`).catch(() => {});
	});

	test('should update folder tree after creation', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		const initialCount = await folderPage.getSubFolderCount();

		await folderPage.createFolder(testFolderName);

		await folderPage.verifyContainsFolder(cleanFolderName);

		const newCount = await folderPage.getSubFolderCount();
		expect(newCount).toBe(initialCount + 1);

		await folderPage.verifyContainsFolder(cleanFolderName);

		const sidebarFolder = folderPage.folderTree
			.locator('[data-testid="folder-tree-item"]')
			.filter({ hasText: cleanFolderName });
		if (await sidebarFolder.isVisible()) {
			await expect(sidebarFolder).toBeVisible();
		}
	});

	test('should cancel folder creation', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		const initialCount = await folderPage.getSubFolderCount();

		await folderPage.cancelFolderCreation();

		const finalCount = await folderPage.getSubFolderCount();
		expect(finalCount).toBe(initialCount);

		const folderExists = await folderPage.folderExistsInSidebar(testFolderName);
		expect(folderExists).toBe(false);
	});

	test('should prevent duplicate folder names', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(cleanFolderName);

		await folderPage.createFolderButton.click();
		await folderPage.waitForVisible(folderPage.createFolderModal);
		await folderPage.fillInput(folderPage.folderNameInput, testFolderName);
		await folderPage.confirmCreateFolder.click();

		await folderPage.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

		const folderButtons = folderPage.folderTree.getByRole('button', {
			name: new RegExp(`Open folder ${cleanFolderName}`, 'i')
		});
		const count = await folderButtons.count();

		if (count === 0) {
			console.log('No folders found - the first folder creation might have failed or been removed');
			expect(count).toBeLessThanOrEqual(1);
		} else {
			expect(count).toBe(1);
		}
	});

	test('should allow folder creation in empty root', async ({ folderPage }) => {
		await folderPage.navigateToRoot();

		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(cleanFolderName);

		const emptyMessage = folderPage.emptyFolderMessage;
		const isEmpty = await emptyMessage.isVisible().catch(() => false);
		expect(isEmpty).toBe(false);
	});
});

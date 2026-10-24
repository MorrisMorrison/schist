import { expect, test } from '../fixtures';
import { createTestDocument } from '../utils/test-data';

test.describe.serial('Document Move', () => {
	const testDocumentPath = '/test-document-operations';
	const testFolderName = 'test-move-folder';

	test('should move document between folders via drag and drop', async ({
		documentViewPage,
		folderPage,
		apiHelper,
		testId
	}) => {
		// Create target folder
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		// Create test document in root
		const testDocument = createTestDocument({
			title: `Moveable Document ${testId}`,
			content: '# Moveable Document\n\nThis document will be moved to a folder.',
			path: testDocumentPath
		});

		expect((await apiHelper.createDocument(testDocument)).status).toBe(201);

		// Navigate to root to see both folder and document
		await folderPage.navigateToRoot();

		const folderTree = folderPage.folderTree;

		// Both the source document and the target folder are created in setup, so
		// both tree items are preconditions for the drag-and-drop move flow.
		const documentTreeItem = folderTree.getByText(testDocument.title);
		const folderTreeItem = folderTree.getByText(testFolderName);
		await expect(documentTreeItem).toBeVisible();
		await expect(folderTreeItem).toBeVisible();

		// Perform drag and drop
		await documentTreeItem.dragTo(folderTreeItem);

		// Navigate to the target folder and wait for the document to appear there
		await folderPage.openSubFolder(testFolderName);
		await folderPage.verifyFolderLoaded(testFolderName);

		// Verify the document was moved to the target folder
		await folderPage.verifyContainsDocument(testDocument.title);

		// Click on the moved document to navigate to it
		await folderPage.documents.getByText(testDocument.title).click();

		// Verify we navigated to the document view
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
		await documentViewPage.expectUrl(`/documents/${testFolderName}${testDocumentPath}`);
	});

	test('should prevent moving document to invalid locations', async ({
		documentViewPage,
		folderPage,
		apiHelper,
		testId
	}) => {
		// Create test document
		const testDocument = createTestDocument({
			title: `Protected Document ${testId}`,
			content: '# Protected Document\n\nThis document move should be prevented.',
			path: testDocumentPath
		});

		expect((await apiHelper.createDocument(testDocument)).status).toBe(201);

		// Try to drag document to itself or invalid target
		await folderPage.navigateToRoot();

		const documentTreeItem = folderPage.folderTree.getByText(testDocument.title);
		await expect(documentTreeItem).toBeVisible();

		// Try to drag to itself (should not work)
		await documentTreeItem.dragTo(documentTreeItem);

		// Verify document is still in original location: still in the tree, still
		// served at its path by the backend, and still viewable there.
		await expect(documentTreeItem).toBeVisible();
		expect((await apiHelper.request('GET', `/documents${testDocumentPath}`)).status).toBe(200);
		await documentViewPage.navigateToDocument(testDocumentPath);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
		await documentViewPage.expectUrl(`/documents${testDocumentPath}`);
	});
});

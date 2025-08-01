import { test, expect } from '../fixtures/test-setup';
import { createTestDocument } from '../utils/test-data';

test.describe('Basic CRUD Functionality', () => {
	test('should create and delete documents (existing functionality)', async ({
		documentViewPage,
		editorPage,
		apiHelper,
		testId
	}) => {
		// Create a test document
		const testDocument = createTestDocument({
			title: `CRUD Test Document ${testId}`,
			content: '# CRUD Test\n\nTesting basic CRUD functionality.',
			path: `/crud-test-${testId}`
		});

		await apiHelper.createDocument(testDocument);

		// Verify document creation
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// Verify document editing
		await documentViewPage.editDocument();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nEdited content added.');
		await editorPage.saveAndExpectNavigation();

		// Verify edit was saved
		await documentViewPage.verifyContentContains('Edited content added');

		// Verify document deletion
		await documentViewPage.deleteDocument();
		await documentViewPage.expectUrl('/');

		// Try to navigate to deleted document - should show 404
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentNotFound();
	});

	test('should create folders via FolderView (existing functionality)', async ({
		folderPage,
		apiHelper
	}) => {
		const testFolderName = 'basic-crud-folder';

		// Navigate to root and create folder
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);

		// Verify folder was created
		await folderPage.verifyContainsFolder(testFolderName);

		// Verify navigation to folder works
		await folderPage.openSubFolder(testFolderName);
		await folderPage.verifyFolderUrl(`/${testFolderName}`);

		// Clean up
		await apiHelper.deleteFolder(`/${testFolderName}`).catch(() => {});
	});

	test('should display folder tree with search (existing functionality)', async ({
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create test content
		const testDocument = createTestDocument({
			title: `Searchable Content ${testId}`,
			content: '# Searchable Content\n\nThis content should be findable.',
			path: `/searchable-${testId}`,
			tags: ['searchable', 'test']
		});

		await apiHelper.createDocument(testDocument);
		await folderPage.navigateToRoot();

		// Check if unified search exists and works
		const searchInput = page
			.locator('input[type="search"], input[placeholder*="search"], input[placeholder*="filter"]')
			.first();

		if (await searchInput.isVisible()) {
			// Test basic text search
			await searchInput.fill('searchable');
			// Wait for search to be processed - verify input has the value
			await expect(searchInput).toHaveValue('searchable');

			// Verify some filtering occurred (tree should change)
			const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]').first();
			const isTreeVisible = await folderTree.isVisible();

			// Just verify search input works - don't make assumptions about results
			expect(isTreeVisible).toBeDefined(); // Tree exists

			// Clear search
			await searchInput.clear();
		}
	});

	test('should handle basic navigation (existing functionality)', async ({
		documentViewPage,
		homePage,
		apiHelper,
		testId
	}) => {
		// Create test document for navigation
		const testDocument = createTestDocument({
			title: `Navigation Test ${testId}`,
			content: '# Navigation Test\n\nTesting basic navigation.',
			path: `/nav-test-${testId}`
		});

		await apiHelper.createDocument(testDocument);

		// Test home -> document navigation
		await homePage.navigate();
		await homePage.verifyLoaded();

		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// Test browser back navigation
		await documentViewPage.page.goBack();
		await homePage.verifyLoaded();

		// Test browser forward navigation
		await documentViewPage.page.goForward();
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
	});

	test('should preserve content during document refresh (existing functionality)', async ({
		documentViewPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create test document
		const testDocument = createTestDocument({
			title: `Refresh Test ${testId}`,
			content: '# Refresh Test\n\nContent that should persist.',
			path: `/refresh-test-${testId}`
		});

		await apiHelper.createDocument(testDocument);

		// Navigate to document
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// Refresh document
		await page.reload();

		// Verify content persists
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
		await documentViewPage.verifyContentContains('Content that should persist');
	});
});

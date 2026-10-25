import { test, expect } from '../fixtures';

test.describe('Navigation and Routing', () => {
	test('should handle deep path navigation correctly', async ({
		documentViewPage,
		folderPage,
		apiHelper,
		testId
	}) => {
		// Create nested pages manually for this complex navigation test
		await apiHelper.seedDocument({
			title: `Parent ${testId}`,
			content: '# Parent Page\n\nThis is a parent page.',
			path: `/parent-${testId}`
		});

		const childDocument = await apiHelper.seedDocument({
			title: `Child ${testId}`,
			content: '# Child Page\n\nThis is a child page.',
			path: `/parent-${testId}/child-${testId}`
		});

		const grandchildDocument = await apiHelper.seedDocument({
			title: `Grandchild ${testId}`,
			content: '# Grandchild Page\n\nThis is a grandchild page.',
			path: `/parent-${testId}/child-${testId}/grandchild-${testId}`
		});

		await documentViewPage.openDocument(grandchildDocument);
		await documentViewPage.verifyDocumentUrl(grandchildDocument.path!);

		const breadcrumbs = await documentViewPage.getBreadcrumbPath();
		expect(breadcrumbs.length).toBeGreaterThan(0);
		expect(breadcrumbs.some((bc) => bc.trim() === 'Home')).toBeTruthy();

		const parentFolderName = `parent-${testId}`;
		await documentViewPage.clickBreadcrumb(parentFolderName);

		await documentViewPage.expectUrl(`/folders/parent-${testId}`);

		// The parent folder lists the child document
		await folderPage.verifyContainsDocument(childDocument.title);
	});

	test('should handle URL changes correctly', async ({
		documentViewPage,
		editorPage,
		withSimpleTestDocument
	}) => {
		const testDocument = withSimpleTestDocument;

		await documentViewPage.openDocument(testDocument);
		await documentViewPage.verifyDocumentUrl(testDocument.path!);

		await editorPage.navigateToEdit(testDocument.path!);
		await editorPage.verifyLoaded();
		// /edit/<path> is a deep link into the document page's edit mode.
		await editorPage.expectUrl(`/documents${testDocument.path!}?mode=edit`);

		await editorPage.cancel();
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
	});

	test('should handle browser back/forward navigation', async ({
		homePage,
		documentViewPage,
		editorPage,
		withSimpleTestDocument,
		page
	}) => {
		const testDocument = withSimpleTestDocument;

		await homePage.navigate();
		await homePage.verifyLoaded();

		await documentViewPage.openDocument(testDocument);

		// Switching to edit mode is a toggle on the same page, not a navigation:
		// it replaces the history entry (?mode=edit) instead of adding one.
		await documentViewPage.editDocument();
		await editorPage.verifyLoaded();

		// Wait for the URL to settle after each history move before asserting the
		// DOM: page.goBack/goForward resolve on the 'load' event, but SPA history
		// navigation is client-side (popstate) and may not fire one, so the
		// assertion can otherwise race the re-render.
		// edit -> home (origin root, nothing after the host)
		await page.goBack();
		await expect(page).toHaveURL(/\/\/[^/]+\/?$/);
		await homePage.verifyLoaded();

		// home -> the document, back in edit mode as it was left
		await page.goForward();
		await editorPage.expectUrl(`/documents${testDocument.path!}?mode=edit`);
		await editorPage.verifyLoaded();

		// edit -> read keeps the same entry too; back goes home again
		await editorPage.cancel();
		await documentViewPage.verifyDocumentUrl(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
		await page.goBack();
		await expect(page).toHaveURL(/\/\/[^/]+\/?$/);
		await homePage.verifyLoaded();
	});

	test('should maintain navigation state across page refreshes', async ({
		documentViewPage,
		withSimpleTestDocument,
		page
	}) => {
		const testDocument = withSimpleTestDocument;

		await documentViewPage.openDocument(testDocument);

		await page.reload();

		await documentViewPage.verifyDocumentLoaded(testDocument.title);
		await documentViewPage.verifyDocumentUrl(testDocument.path!);
	});

	test('should handle navigation from search results', async ({
		homePage,
		documentViewPage,
		apiHelper,
		testId
	}) => {
		// Create a searchable page manually for this search-specific test
		const searchableDocument = await apiHelper.seedDocument({
			title: `Searchable ${testId}`,
			content: `# Searchable Content ${testId}\n\nThis page contains unique searchable content for testing.`,
			path: `/searchable-${testId}`,
			tags: ['searchable', 'unique']
		});

		await homePage.navigate();
		await homePage.verifyLoaded();

		await homePage.search(searchableDocument.title);

		await homePage.clickSearchResult(searchableDocument.title);

		await documentViewPage.verifyDocumentLoaded(searchableDocument.title);
		await documentViewPage.verifyDocumentUrl(searchableDocument.path!);
	});

	test('should handle concurrent navigation requests', async ({
		documentViewPage,
		apiHelper,
		testId
	}) => {
		// Create two pages manually for this concurrent navigation test
		const document1 = await apiHelper.seedDocument({
			title: `Concurrent 1 ${testId}`,
			content: '# Concurrent Page 1',
			path: `/concurrent-1-${testId}`
		});

		const document2 = await apiHelper.seedDocument({
			title: `Concurrent 2 ${testId}`,
			content: '# Concurrent Page 2',
			path: `/concurrent-2-${testId}`
		});

		await documentViewPage.openDocument(document1);

		await documentViewPage.openDocument(document2);

		await documentViewPage.verifyDocumentUrl(document2.path!);
	});

	// Scroll position is not asserted: a full navigation away and back does not
	// restore it. This covers reloading a long document after leaving it.
	test('should reload a long document after navigating away', async ({
		documentViewPage,
		apiHelper,
		testId
	}) => {
		// Create a long page manually for this scroll position test
		const longContent = Array(50)
			.fill(0)
			.map((_, i) => `## Section ${i + 1}\n\nThis is section ${i + 1} with some content.\n\n`)
			.join('');

		const longDocument = await apiHelper.seedDocument({
			title: `Long Page ${testId}`,
			content: `# Long Page\n\n${longContent}`,
			path: `/long-page-${testId}`
		});

		await documentViewPage.openDocument(longDocument);

		await documentViewPage.goto('/');
		await documentViewPage.openDocument(longDocument);
	});
});

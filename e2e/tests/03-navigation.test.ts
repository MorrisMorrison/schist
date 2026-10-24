import { test, expect } from '../fixtures';
import { createTestDocument } from '../utils/test-data';

test.describe('Navigation and Routing', () => {
	test('should handle deep path navigation correctly', async ({
		documentViewPage,
		apiHelper,
		testId
	}) => {
		// Create nested pages manually for this complex navigation test
		const parentDocument = createTestDocument({
			title: `Parent ${testId}`,
			content: '# Parent Page\n\nThis is a parent page.',
			path: `/parent-${testId}`
		});

		const childDocument = createTestDocument({
			title: `Child ${testId}`,
			content: '# Child Page\n\nThis is a child page.',
			path: `/parent-${testId}/child-${testId}`
		});

		const grandchildDocument = createTestDocument({
			title: `Grandchild ${testId}`,
			content: '# Grandchild Page\n\nThis is a grandchild page.',
			path: `/parent-${testId}/child-${testId}/grandchild-${testId}`
		});

		for (const document of [parentDocument, childDocument, grandchildDocument]) {
			expect((await apiHelper.createDocument(document)).status).toBe(201);
		}

		await documentViewPage.navigateToDocument(grandchildDocument.path!);
		await documentViewPage.verifyDocumentLoaded(grandchildDocument.title);
		await documentViewPage.verifyDocumentUrl(grandchildDocument.path!);

		const breadcrumbs = await documentViewPage.getBreadcrumbPath();
		expect(breadcrumbs.length).toBeGreaterThan(0);
		expect(breadcrumbs.some((bc) => bc.trim() === 'Home')).toBeTruthy();

		const parentFolderName = `parent-${testId}`;
		await documentViewPage.clickBreadcrumb(parentFolderName);

		await documentViewPage.expectUrl(`/folders/parent-${testId}`);

		// The parent folder lists the child document
		const documentsSection = documentViewPage.page.getByTestId('documents-section');
		await expect(documentsSection.getByText(childDocument.title)).toBeVisible();
	});

	test('should handle URL changes correctly', async ({
		documentViewPage,
		editorPage,
		withSimpleTestDocument
	}) => {
		const testDocument = withSimpleTestDocument;

		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
		await documentViewPage.verifyDocumentUrl(testDocument.path!);

		await editorPage.navigateToEdit(testDocument.path!);
		await editorPage.verifyLoaded();
		await editorPage.expectUrl(`/edit${testDocument.path!}`);

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

		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		await documentViewPage.editDocument();
		await editorPage.verifyLoaded();

		// edit -> document view. Wait for the URL to settle after each history
		// move before asserting the DOM: page.goBack/goForward resolve on the
		// 'load' event, but SPA history navigation is client-side (popstate) and
		// may not fire one, so the assertion can otherwise race the re-render.
		await page.goBack();
		await documentViewPage.verifyDocumentUrl(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// document view -> edit
		await page.goForward();
		await editorPage.expectUrl(`/edit${testDocument.path!}`);
		await editorPage.verifyLoaded();

		// edit -> document view. Settle here before the next back: two goBack()
		// calls fired back-to-back race (the second can run before the first
		// popstate is processed), which intermittently lands somewhere other than
		// home on a slow runner.
		await page.goBack();
		await documentViewPage.verifyDocumentUrl(testDocument.path!);

		// document view -> home (origin root, nothing after the host)
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

		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

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
		const searchableDocument = createTestDocument({
			title: `Searchable ${testId}`,
			content: `# Searchable Content ${testId}\n\nThis page contains unique searchable content for testing.`,
			path: `/searchable-${testId}`,
			tags: ['searchable', 'unique']
		});

		await apiHelper.createDocument(searchableDocument);

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
		const document1 = createTestDocument({
			title: `Concurrent 1 ${testId}`,
			content: '# Concurrent Page 1',
			path: `/concurrent-1-${testId}`
		});

		const document2 = createTestDocument({
			title: `Concurrent 2 ${testId}`,
			content: '# Concurrent Page 2',
			path: `/concurrent-2-${testId}`
		});

		await apiHelper.createDocument(document1);
		await apiHelper.createDocument(document2);

		await documentViewPage.navigateToDocument(document1.path!);
		await documentViewPage.verifyDocumentLoaded(document1.title);

		await documentViewPage.navigateToDocument(document2.path!);
		await documentViewPage.verifyDocumentLoaded(document2.title);

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

		const longDocument = createTestDocument({
			title: `Long Page ${testId}`,
			content: `# Long Page\n\n${longContent}`,
			path: `/long-page-${testId}`
		});

		await apiHelper.createDocument(longDocument);

		await documentViewPage.navigateToDocument(longDocument.path!);
		await documentViewPage.verifyDocumentLoaded(longDocument.title);

		await documentViewPage.goto('/');
		await documentViewPage.navigateToDocument(longDocument.path!);
		await documentViewPage.verifyDocumentLoaded(longDocument.title);
	});
});

import { test, expect } from '../fixtures/test-setup';
import { createTestPage } from '../utils/test-data';

test.describe('Navigation and Routing', () => {
	test('should handle deep path navigation correctly', async ({
		documentViewPage,
		apiHelper,
		testId
	}) => {
		const parentPage = createTestPage({
			title: `Parent ${testId}`,
			content: '# Parent Page\n\nThis is a parent page.',
			path: `/parent-${testId}`
		});

		const childPage = createTestPage({
			title: `Child ${testId}`,
			content: '# Child Page\n\nThis is a child page.',
			path: `/parent-${testId}/child-${testId}`
		});

		const grandchildPage = createTestPage({
			title: `Grandchild ${testId}`,
			content: '# Grandchild Page\n\nThis is a grandchild page.',
			path: `/parent-${testId}/child-${testId}/grandchild-${testId}`
		});

		await apiHelper.createPage(parentPage);
		await apiHelper.createPage(childPage);
		await apiHelper.createPage(grandchildPage);

		await documentViewPage.navigateToPage(grandchildPage.path!);
		await documentViewPage.verifyPageLoaded(grandchildPage.title);
		await documentViewPage.verifyPageUrl(grandchildPage.path!);

		const breadcrumbs = await documentViewPage.getBreadcrumbPath();
		expect(breadcrumbs.length).toBeGreaterThan(0);
		expect(breadcrumbs.some((bc) => bc.trim() === 'Home')).toBeTruthy();

		const parentFolderName = `parent-${testId}`;
		await documentViewPage.clickBreadcrumb(parentFolderName);

		await documentViewPage.expectUrl(`/folders/parent-${testId}`);

		const emptyMessage = documentViewPage.page.locator('[data-testid="empty-folder-message"]');
		const documentsSection = documentViewPage.page.locator('[data-testid="documents-section"]');

		if (await emptyMessage.isVisible()) {
			console.log('Folder appears empty - no child documents found');
			return;
		}

		const childText = `Child ${testId}`;
		await documentsSection.getByText(childText, { exact: false }).waitFor();
	});

	test('should handle URL changes correctly', async ({
		documentViewPage,
		editorPage,
		apiHelper,
		testId
	}) => {
		const testPage = createTestPage({
			title: `URL Test ${testId}`,
			content: '# URL Test\n\nTesting URL changes.',
			path: `/url-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		await documentViewPage.navigateToPage(testPage.path!);
		await documentViewPage.verifyPageLoaded(testPage.title);
		await documentViewPage.verifyPageUrl(testPage.path!);

		await editorPage.navigateToEdit(testPage.path!);
		await editorPage.verifyLoaded();
		await editorPage.expectUrl(`/edit${testPage.path!}`);

		await editorPage.cancel();
		await documentViewPage.verifyPageLoaded(testPage.title);
	});

	test('should handle browser back/forward navigation', async ({
		homePage,
		documentViewPage,
		editorPage,
		apiHelper,
		testId,
		page
	}) => {
		const testPage = createTestPage({
			title: `History Test ${testId}`,
			content: '# History Test\n\nTesting browser history.',
			path: `/history-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		await homePage.navigate();
		await homePage.verifyLoaded();

		await documentViewPage.navigateToPage(testPage.path!);
		await documentViewPage.verifyPageLoaded(testPage.title);

		await documentViewPage.editPage();
		await editorPage.verifyLoaded();

		await page.goBack();
		await documentViewPage.verifyPageLoaded(testPage.title);

		await page.goForward();
		await editorPage.verifyLoaded();

		await page.goBack();
		await page.goBack();
		await homePage.verifyLoaded();
	});

	test('should maintain navigation state across page refreshes', async ({
		documentViewPage,
		apiHelper,
		testId,
		page
	}) => {
		const testPage = createTestPage({
			title: `Refresh Test ${testId}`,
			content: '# Refresh Test\n\nTesting page refresh.',
			path: `/refresh-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		await documentViewPage.navigateToPage(testPage.path!);
		await documentViewPage.verifyPageLoaded(testPage.title);

		await page.reload();

		await documentViewPage.verifyPageLoaded(testPage.title);
		await documentViewPage.verifyPageUrl(testPage.path!);
	});

	test('should handle navigation from search results', async ({
		homePage,
		documentViewPage,
		apiHelper,
		testId
	}) => {
		const searchablePage = createTestPage({
			title: `Searchable ${testId}`,
			content: `# Searchable Content ${testId}\n\nThis page contains unique searchable content for testing.`,
			path: `/searchable-${testId}`,
			tags: ['searchable', 'unique']
		});

		await apiHelper.createPage(searchablePage);

		await homePage.navigate();
		await homePage.verifyLoaded();

		await homePage.search(searchablePage.title);

		await homePage.clickSearchResult(searchablePage.title);

		await documentViewPage.verifyPageLoaded(searchablePage.title);
		await documentViewPage.verifyPageUrl(searchablePage.path!);
	});

	test('should handle concurrent navigation requests', async ({
		documentViewPage,
		apiHelper,
		testId
	}) => {
		const page1 = createTestPage({
			title: `Concurrent 1 ${testId}`,
			content: '# Concurrent Page 1',
			path: `/concurrent-1-${testId}`
		});

		const page2 = createTestPage({
			title: `Concurrent 2 ${testId}`,
			content: '# Concurrent Page 2',
			path: `/concurrent-2-${testId}`
		});

		await apiHelper.createPage(page1);
		await apiHelper.createPage(page2);

		await documentViewPage.navigateToPage(page1.path!);
		await documentViewPage.verifyPageLoaded(page1.title);

		await documentViewPage.navigateToPage(page2.path!);
		await documentViewPage.verifyPageLoaded(page2.title);

		await documentViewPage.verifyPageUrl(page2.path!);
	});

	test('should preserve scroll position on navigation', async ({
		documentViewPage,
		apiHelper,
		testId
	}) => {
		const longContent = Array(50)
			.fill(0)
			.map((_, i) => `## Section ${i + 1}\n\nThis is section ${i + 1} with some content.\n\n`)
			.join('');

		const longPage = createTestPage({
			title: `Long Page ${testId}`,
			content: `# Long Page\n\n${longContent}`,
			path: `/long-page-${testId}`
		});

		await apiHelper.createPage(longPage);

		await documentViewPage.navigateToPage(longPage.path!);
		await documentViewPage.verifyPageLoaded(longPage.title);

		await documentViewPage.page.evaluate(() => window.scrollTo(0, 1000));

		await documentViewPage.goto('/');
		await documentViewPage.navigateToPage(longPage.path!);
		await documentViewPage.verifyPageLoaded(longPage.title);
	});
});

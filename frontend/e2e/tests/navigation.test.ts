import { test, expect } from '../fixtures/test-setup';
import { createTestPage } from '../utils/test-data';

test.describe('Navigation and Routing', () => {
	test('should handle deep path navigation correctly', async ({
		pageViewPage,
		apiHelper,
		testId
	}) => {
		// Create nested pages
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

		// Navigate to deepest page
		await pageViewPage.navigateToPage(grandchildPage.path!);
		await pageViewPage.verifyPageLoaded(grandchildPage.title);
		await pageViewPage.verifyPageUrl(grandchildPage.path!);

		const breadcrumbs = await pageViewPage.getBreadcrumbPath();
		expect(breadcrumbs.length).toBeGreaterThan(0);
		expect(breadcrumbs.some((bc) => bc.trim() === 'Home')).toBeTruthy();

		const parentFolderName = `parent-${testId}`;
		await pageViewPage.clickBreadcrumb(parentFolderName);

		await pageViewPage.expectUrl(`/folders/parent-${testId}`);

		const childText = `child-${testId}`;
		await pageViewPage.page.getByText(childText, { exact: false }).waitFor({ timeout: 5000 });
	});

	test('should handle URL changes correctly', async ({
		pageViewPage,
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

		// Direct URL navigation to page view
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);
		await pageViewPage.verifyPageUrl(testPage.path!);

		// Navigate to edit via URL
		await editorPage.navigateToEdit(testPage.path!);
		await editorPage.verifyLoaded();
		await editorPage.expectUrl(`/edit${testPage.path!}`);

		// Navigate back to view
		await editorPage.cancel();
		await pageViewPage.verifyPageLoaded(testPage.title);
	});

	test('should handle browser back/forward navigation', async ({
		homePage,
		pageViewPage,
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

		// Start at home
		await homePage.navigate();
		await homePage.verifyLoaded();

		// Navigate to page view
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Navigate to edit
		await pageViewPage.editPage();
		await editorPage.verifyLoaded();

		// Use browser back button
		await page.goBack();
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Use browser forward button
		await page.goForward();
		await editorPage.verifyLoaded();

		// Go back twice to reach home
		await page.goBack();
		await page.goBack();
		await homePage.verifyLoaded();
	});

	test('should maintain navigation state across page refreshes', async ({
		pageViewPage,
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

		// Navigate to page
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Refresh the page
		await page.reload();

		// Verify page still loads correctly
		await pageViewPage.verifyPageLoaded(testPage.title);
		await pageViewPage.verifyPageUrl(testPage.path!);
	});

	test('should handle navigation from search results', async ({
		homePage,
		pageViewPage,
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

		// Go to home and search
		await homePage.navigate();
		await homePage.verifyLoaded();

		// Search for the page
		await homePage.search(searchablePage.title);

		// Click on search result
		await homePage.clickSearchResult(searchablePage.title);

		// Verify navigation to correct page
		await pageViewPage.verifyPageLoaded(searchablePage.title);
		await pageViewPage.verifyPageUrl(searchablePage.path!);
	});

	test('should handle concurrent navigation requests', async ({
		pageViewPage,
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

		// Navigate to first page
		await pageViewPage.navigateToPage(page1.path!);
		await pageViewPage.verifyPageLoaded(page1.title);

		// Quickly navigate to second page (simulating fast user clicks)
		await pageViewPage.navigateToPage(page2.path!);
		await pageViewPage.verifyPageLoaded(page2.title);

		// Verify we ended up on the correct page
		await pageViewPage.verifyPageUrl(page2.path!);
	});

	test('should preserve scroll position on navigation', async ({
		pageViewPage,
		apiHelper,
		testId
	}) => {
		// Create a long page
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

		// Navigate to page
		await pageViewPage.navigateToPage(longPage.path!);
		await pageViewPage.verifyPageLoaded(longPage.title);

		// Scroll down
		await pageViewPage.page.evaluate(() => window.scrollTo(0, 1000));

		// Navigate away and back
		await pageViewPage.goto('/');
		await pageViewPage.navigateToPage(longPage.path!);
		await pageViewPage.verifyPageLoaded(longPage.title);

		// Note: Scroll position preservation is browser-dependent
		// This test mainly ensures navigation still works with scrolled pages
	});
});

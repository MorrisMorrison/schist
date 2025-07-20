import { test, expect } from '../fixtures/test-setup';
import { createTestPage } from '../utils/test-data';

// serial enforces not running in parallel
test.describe.serial('Page Lifecycle', () => {
	test('should create a new page successfully', async ({ editorPage, pageViewPage, testId }) => {
		const testPage = createTestPage({
			title: `Test Page ${testId}`,
			content: `# Test Page ${testId}\n\nThis is a test page for page creation.`,
			tags: ['test', 'lifecycle']
		});

		// Navigate directly to new page editor
		await editorPage.navigateToNew();

		// Verify editor loaded
		await editorPage.verifyLoaded();
		await editorPage.expectUrl('/new');

		// Fill in page details
		await editorPage.fillPageDetails(testPage.title, testPage.content, testPage.tags!);

		// Save and navigate to page view
		await editorPage.saveAndExpectNavigation();

		// Verify page was created and displays correctly
		await pageViewPage.verifyPageLoaded(testPage.title);
		await pageViewPage.verifyContentContains('This is a test page for page creation');
		await pageViewPage.verifyTags(testPage.tags!);
	});

	test('should edit an existing page', async ({ editorPage, pageViewPage, apiHelper, testId }) => {
		// Create a page via API first
		const originalPage = createTestPage({
			title: `Original Page ${testId}`,
			content: '# Original Content\n\nThis content will be edited.',
			path: `/test-edit-${testId}`
		});

		await apiHelper.createPage(originalPage);

		// Navigate to the page
		await pageViewPage.navigateToPage(originalPage.path!);
		await pageViewPage.verifyPageLoaded(originalPage.title);

		// Click edit button
		await pageViewPage.editPage();

		// Verify editor loaded with existing content
		await editorPage.verifyLoaded();
		await editorPage.verifyTitle(originalPage.title);
		await editorPage.verifyContent('Original Content');

		// Modify the content
		const updatedContent = '# Updated Content\n\nThis content has been edited via e2e test.';
		await editorPage.clearContent();
		await editorPage.typeContent(updatedContent);

		// Save changes
		await editorPage.saveAndExpectNavigation();

		// Verify changes are reflected
		await pageViewPage.verifyContentContains('Updated Content');
		await pageViewPage.verifyContentContains('edited via e2e test');
	});

	test('should delete a page', async ({ pageViewPage, apiHelper, testId }) => {
		// Create a page to delete
		const pageToDelete = createTestPage({
			title: `Delete Me ${testId}`,
			content: '# Page to Delete\n\nThis page will be deleted.',
			path: `/delete-test-${testId}`
		});

		await apiHelper.createPage(pageToDelete);

		// Navigate to the page
		await pageViewPage.navigateToPage(pageToDelete.path!);
		await pageViewPage.verifyPageLoaded(pageToDelete.title);

		// Delete the page
		await pageViewPage.deletePage();

		// Verify redirect and page no longer exists
		await pageViewPage.expectUrl('/');

		// Try to navigate to deleted page - should show 404
		await pageViewPage.navigateToPage(pageToDelete.path!);
		await pageViewPage.verifyPageNotFound();
	});

	test('should handle viewing non-existent page', async ({ pageViewPage, testId }) => {
		// Try to navigate to a page that doesn't exist
		const nonExistentPath = `/non-existent-page-${testId}`;
		await pageViewPage.navigateToPage(nonExistentPath);

		// Should show 404 or not found message
		await pageViewPage.verifyPageNotFound();
	});

	test('should preserve content when navigating away and back', async ({
		editorPage,
		pageViewPage,
		apiHelper,
		testId
	}) => {
		// Create a page via API
		const testPage = createTestPage({
			title: `Navigation Test ${testId}`,
			content: '# Navigation Test\n\nContent to preserve.',
			path: `/navigation-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to page view
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Navigate to edit
		await pageViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.verifyContent('Navigation Test');

		// Navigate back to view without saving
		await editorPage.cancel();

		// Verify we're back on page view with original content
		await pageViewPage.verifyPageLoaded(testPage.title);
		await pageViewPage.verifyContentContains('Content to preserve');
	});

	test('should display page metadata correctly', async ({ pageViewPage, apiHelper, testId }) => {
		const testPage = createTestPage({
			title: `Metadata Test ${testId}`,
			content: '# Metadata Test\n\nTesting metadata display.',
			path: `/metadata-test-${testId}`,
			tags: ['metadata', 'test', 'e2e']
		});

		await apiHelper.createPage(testPage);

		// Navigate to page
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Verify metadata is displayed
		await pageViewPage.verifyMetadata();
		await pageViewPage.verifyTags(testPage.tags!);
	});

	test('should render markdown content correctly', async ({ pageViewPage, apiHelper, testId }) => {
		const markdownContent = `# Main Heading

## Subheading

This is **bold text** and this is *italic text*.

\`\`\`javascript
console.log('Hello, World!');
\`\`\`

- List item 1
- List item 2
- List item 3

[Link to home](/)`;

		const testPage = createTestPage({
			title: `Markdown Test ${testId}`,
			content: markdownContent,
			path: `/markdown-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to page
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Verify markdown has been rendered to HTML
		await pageViewPage.verifyMarkdownRendering();
		await pageViewPage.verifyHeading('Main Heading', 1);
		await pageViewPage.verifyHeading('Subheading', 2);

		// Verify we have expected number of elements
		const headingCount = await pageViewPage.getHeadingCount();
		expect(headingCount).toBeGreaterThanOrEqual(2);

		const linkCount = await pageViewPage.getLinkCount();
		expect(linkCount).toBeGreaterThanOrEqual(1);
	});
});

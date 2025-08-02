import { test } from '../fixtures/test-setup';
import { createTestPage } from '../utils/test-data';

test.describe('Auto-save Functionality', () => {
	test('should auto-save content without navigation', async ({
		editorPage,
		documentViewPage,
		apiHelper,
		testId
	}) => {
		// Create initial page
		const testPage = createTestPage({
			title: `Autosave Test ${testId}`,
			content: '# Initial Content\n\nThis content will be auto-saved.',
			path: `/autosave-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to edit page
		await editorPage.navigateToEdit(testPage.path!);
		await editorPage.verifyLoaded();

		// Verify initial content
		await editorPage.verifyTitle(testPage.title);
		await editorPage.verifyContent('Initial Content');

		// Make changes to trigger auto-save
		const newContent = '\n\nAdditional content added for auto-save test.';
		await editorPage.typeContent(newContent);

		// Wait for auto-save to trigger
		await editorPage.waitForAutoSave();

		// Verify we're still on the edit page (no navigation occurred)
		await editorPage.expectUrl(`/edit${testPage.path}`);

		// Navigate to view page to verify auto-save worked
		await documentViewPage.navigateToPage(testPage.path!);
		await documentViewPage.verifyPageLoaded(testPage.title);
		await documentViewPage.verifyContentContains('Additional content added for auto-save test');
	});

	test('should handle auto-save errors gracefully', async ({
		editorPage,
		apiHelper,
		testId,
		page
	}) => {
		const testPage = createTestPage({
			title: `Error Test ${testId}`,
			content: '# Error Test',
			path: `/error-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to edit
		await editorPage.navigateToEdit(testPage.path!);
		await editorPage.verifyLoaded();

		// Simulate network failure by intercepting API calls
		await page.route('**/api/documents/**', (route) => {
			route.abort('failed');
		});

		// Make changes that would trigger auto-save
		await editorPage.typeContent('\n\nThis change should fail to save.');

		// Wait for auto-save attempt
		await editorPage.waitForAutoSave(5000);

		// Note: This test verifies error handling behavior when save fails

		// Verify content is still in editor despite save failure
		await editorPage.verifyContent('This change should fail to save');

		// Remove network failure simulation
		await page.unroute('**/api/documents/**');

		// Try manual save - should work now
		await editorPage.saveAndExpectNavigation();
		await editorPage.page.waitForLoadState('networkidle');
	});
});

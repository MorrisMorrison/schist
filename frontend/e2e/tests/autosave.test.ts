import { test } from '../fixtures/test-setup';
import { createTestPage } from '../utils/test-data';

test.describe('Auto-save Functionality', () => {
	test('should auto-save content without navigation', async ({
		editorPage,
		pageViewPage,
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
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);
		await pageViewPage.verifyContentContains('Additional content added for auto-save test');
	});

	test('should preserve changes during auto-save', async ({
		editorPage,
		pageViewPage,
		apiHelper,
		testId
	}) => {
		const testPage = createTestPage({
			title: `Preserve Test ${testId}`,
			content: '# Original Content',
			path: `/preserve-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Edit the page
		await editorPage.navigateToEdit(testPage.path!);
		await editorPage.verifyLoaded();

		// Clear and add new content
		await editorPage.clearContent();
		const newContent = '# Modified Content\n\nThis content was modified and should be preserved.';
		await editorPage.typeContent(newContent);

		// Wait for auto-save
		await editorPage.waitForAutoSave();

		// Verify content is still in editor
		await editorPage.verifyContent('Modified Content');

		// Navigate away and back to verify persistence
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyContentContains('Modified Content');

		// Go back to edit and verify content is preserved
		await pageViewPage.editPage();
		await editorPage.verifyContent('Modified Content');
	});

	test('should distinguish between auto-save and manual save', async ({
		editorPage,
		pageViewPage,
		apiHelper,
		testId
	}) => {
		const testPage = createTestPage({
			title: `Manual Save Test ${testId}`,
			content: '# Manual Save Test',
			path: `/manual-save-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to edit
		await editorPage.navigateToEdit(testPage.path!);
		await editorPage.verifyLoaded();

		// Make changes
		await editorPage.typeContent('\n\nAuto-save changes.');

		// Wait for auto-save (should not navigate)
		await editorPage.waitForAutoSave();
		await editorPage.expectUrl(`/edit${testPage.path}`);

		// Make more changes and manually save
		await editorPage.typeContent('\n\nManual save changes.');
		await editorPage.saveAndExpectNavigation();

		// Manual save should navigate to page view
		await pageViewPage.verifyPageLoaded(testPage.title);
		await pageViewPage.verifyContentContains('Auto-save changes');
		await pageViewPage.verifyContentContains('Manual save changes');
	});

	test('should handle auto-save with keyboard shortcuts', async ({
		editorPage,
		pageViewPage,
		apiHelper,
		testId
	}) => {
		const testPage = createTestPage({
			title: `Keyboard Test ${testId}`,
			content: '# Keyboard Test',
			path: `/keyboard-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to edit
		await editorPage.navigateToEdit(testPage.path!);
		await editorPage.verifyLoaded();

		// Make changes
		await editorPage.typeContent('\n\nChanges via keyboard.');

		// Use Ctrl+S (should behave like manual save, not auto-save)
		await editorPage.saveWithKeyboard();

		// Keyboard save should navigate away
		await pageViewPage.verifyPageLoaded(testPage.title);
		await pageViewPage.verifyContentContains('Changes via keyboard');
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
		await page.route('**/api/pages/**', (route) => {
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
		await page.unroute('**/api/pages/**');

		// Try manual save - should work now
		await editorPage.saveAndExpectNavigation();
		await editorPage.page.waitForLoadState('networkidle');
	});

	test('should handle concurrent auto-save attempts', async ({ editorPage, apiHelper, testId }) => {
		const testPage = createTestPage({
			title: `Concurrent Save ${testId}`,
			content: '# Concurrent Test',
			path: `/concurrent-save-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to edit
		await editorPage.navigateToEdit(testPage.path!);
		await editorPage.verifyLoaded();

		// Make multiple rapid changes to potentially trigger concurrent saves
		for (let i = 1; i <= 5; i++) {
			await editorPage.typeContent(`\n\nChange ${i}`);
			// Small delay to simulate realistic typing
		}

		// Wait for all auto-saves to complete
		await editorPage.waitForAutoSave(5000);

		// Verify all changes are preserved
		for (let i = 1; i <= 5; i++) {
			await editorPage.verifyContent(`Change ${i}`);
		}
	});

	test('should auto-save tag changes', async ({ editorPage, pageViewPage, apiHelper, testId }) => {
		const testPage = createTestPage({
			title: `Tag Test ${testId}`,
			content: '# Tag Test',
			path: `/tag-test-${testId}`,
			tags: ['original']
		});

		await apiHelper.createPage(testPage);

		// Navigate to edit
		await editorPage.navigateToEdit(testPage.path!);
		await editorPage.verifyLoaded();

		// Add new tags
		await editorPage.addTags(['auto-saved', 'e2e-test']);

		// Wait for auto-save
		await editorPage.waitForAutoSave();

		// Verify tags are auto-saved
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyTags(['original', 'auto-saved', 'e2e-test']);
	});
});

import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

function waitForAutoSaveRequest(page: Page) {
	return page.waitForRequest(
		(req) => req.method() === 'PUT' && req.url().includes('/api/documents/'),
		{ timeout: 20000 }
	);
}

test.describe('Auto-save Functionality', () => {
	test('should auto-save content without navigation', async ({
		editorPage,
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		// Navigate to edit page
		await editorPage.navigateToEdit(testDocument.path!);
		await editorPage.verifyLoaded();

		// Verify initial content
		await editorPage.verifyTitle(testDocument.title);
		await editorPage.verifyContent(testDocument.title);

		// Make changes to trigger auto-save
		const newContent = '\n\nAdditional content added for auto-save test.';
		await editorPage.typeContent(newContent);

		// Wait for auto-save to trigger
		await editorPage.waitForAutoSave();

		// Verify we're still on the edit page (no navigation occurred)
		await editorPage.expectUrl(`/edit${testDocument.path}`);

		// Navigate to view page to verify auto-save worked
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
		await documentViewPage.verifyContentContains('Additional content added for auto-save test');
	});

	test('should handle auto-save errors gracefully', async ({
		editorPage,
		documentViewPage,
		withSimpleTestDocument: testDocument,
		page
	}) => {
		// Navigate to edit
		await editorPage.navigateToEdit(testDocument.path!);
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

		// Try manual save - should work now, and persist the change
		await editorPage.saveAndExpectNavigation();
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
		await documentViewPage.verifyContentContains('This change should fail to save');
	});

	test('should keep auto-saving to the new path after the title changes', async ({
		editorPage,
		documentViewPage,
		withSimpleTestDocument: testDocument,
		testId,
		page
	}) => {
		const oldPath = testDocument.path!; // e.g. /simple-<testId>
		const newTitle = `Renamed ${testId}`;
		const newPath = `/renamed-${testId.toLowerCase()}`;

		await editorPage.navigateToEdit(oldPath);
		await editorPage.verifyLoaded();

		// First auto-save renames the document (its title drives the path).
		const firstSave = waitForAutoSaveRequest(page);
		await editorPage.setContent(`# ${newTitle}\n\nFirst edit.`);
		const first = await firstSave;
		expect(new URL(first.url()).pathname).toBe(`/api/documents${oldPath}`);
		expect((await first.response())?.status()).toBe(200);
		await expect(page).toHaveURL(new RegExp(`/edit${newPath}$`));

		// The next auto-save must target the renamed document, not the old path.
		const secondSave = waitForAutoSaveRequest(page);
		await editorPage.appendContent('\n\nSecond edit.');
		const second = await secondSave;
		expect(new URL(second.url()).pathname).toBe(`/api/documents${newPath}`);
		expect((await second.response())?.status()).toBe(200);

		await documentViewPage.navigateToDocument(newPath);
		await documentViewPage.verifyDocumentLoaded(newTitle);
		await documentViewPage.verifyContentContains('Second edit.');
	});
});

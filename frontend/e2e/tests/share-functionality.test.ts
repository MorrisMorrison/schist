import { test, expect } from '../fixtures';
import { createTestPage as createTestDocument } from '../utils/test-data';
import { SharedDocumentPage } from '../pages/SharedDocumentPage';

test.describe.serial('Share Functionality', () => {
	test('should open share modal from document view', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		// Navigate to the document
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// Click share button
		await documentViewPage.openShareModal();

		// Verify modal content
		const modal = documentViewPage.page.locator('[role="dialog"]').filter({ hasText: 'Share' });
		await expect(modal.getByText(`Share "${testDocument.title}"`)).toBeVisible();
		await expect(modal.getByText('Create New Share Link')).toBeVisible();
		await expect(modal.getByText('Active Share Links')).toBeVisible();
		await expect(modal.getByText('No share links created yet')).toBeVisible();

		// Close modal
		await documentViewPage.closeShareModal();
	});

	test('should create a share link with default expiry', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		await documentViewPage.navigateToDocument(testDocument.path!);

		// Create share link with default (7 days) expiry
		const shareUrl = await documentViewPage.createShareLink();

		// Verify share URL format
		expect(shareUrl).toMatch(/\/share\/[a-f0-9]{64}$/);
		// Share URL should contain a valid base URL (could be frontend or backend depending on config)
		expect(shareUrl).toMatch(/^https?:\/\/localhost:\d+\/share\/[a-f0-9]{64}$/);

		// Verify modal shows the created share
		const activeLinks = await documentViewPage.getActiveShareLinks();
		expect(activeLinks).toContain(shareUrl);

		await documentViewPage.closeShareModal();
	});

	test('should create share links with different expiry options', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		await documentViewPage.navigateToDocument(testDocument.path!);

		// Test different expiry options
		const expiryOptions = [1, 7, 30, 90, 0]; // 1 day, 1 week, 1 month, 3 months, never
		const shareUrls: string[] = [];

		for (const expiry of expiryOptions) {
			const shareUrl = await documentViewPage.createShareLink(expiry);
			shareUrls.push(shareUrl);

			// Verify each URL is unique
			expect(shareUrl).toMatch(/\/share\/[a-f0-9]{64}$/);
			expect(shareUrls.filter((url) => url === shareUrl)).toHaveLength(1);
		}

		// Verify all shares are listed in modal
		const activeLinks = await documentViewPage.getActiveShareLinks();
		expect(activeLinks).toHaveLength(expiryOptions.length);

		await documentViewPage.closeShareModal();
	});

	test('should copy share link to clipboard', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		await documentViewPage.navigateToDocument(testDocument.path!);

		// Create a share link
		await documentViewPage.createShareLink();

		// Copy the link
		await documentViewPage.copyShareLink();

		// Verify success message appears
		const modal = documentViewPage.page.locator('[role="dialog"]').filter({ hasText: 'Share' });
		await expect(modal.getByText(/copied to clipboard/i)).toBeVisible();

		await documentViewPage.closeShareModal();
	});

	test('should revoke share links', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		await documentViewPage.navigateToDocument(testDocument.path!);

		// Create multiple share links
		await documentViewPage.createShareLink(7);
		await documentViewPage.createShareLink(30);

		// Verify we have 2 active links
		let activeLinks = await documentViewPage.getActiveShareLinks();
		expect(activeLinks).toHaveLength(2);

		// Revoke the first link
		await documentViewPage.revokeShareLink(0);

		// Verify success message and link count
		const modal = documentViewPage.page.locator('[role="dialog"]').filter({ hasText: 'Share' });
		await expect(modal.getByText(/revoked successfully/i)).toBeVisible();

		// Wait a moment for UI update
		await documentViewPage.page.waitForTimeout(500);

		activeLinks = await documentViewPage.getActiveShareLinks();
		expect(activeLinks).toHaveLength(1);

		await documentViewPage.closeShareModal();
	});

	test('should access shared document without authentication', async ({
		page,
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		// Create share link while authenticated
		await documentViewPage.navigateToDocument(testDocument.path!);
		const shareUrl = await documentViewPage.createShareLink();
		await documentViewPage.closeShareModal();

		// Extract token from share URL
		const token = shareUrl.split('/share/')[1];
		expect(token).toMatch(/^[a-f0-9]{64}$/);

		// Create new SharedDocumentPage instance
		const sharedPage = new SharedDocumentPage(page);

		// Navigate to shared document (this should work without authentication)
		await sharedPage.navigateToSharedDocument(token);

		// Verify shared document is loaded
		await sharedPage.verifySharedDocumentLoaded(testDocument.title);
		await sharedPage.verifyContentContains(testDocument.content);

		if (testDocument.tags && testDocument.tags.length > 0) {
			await sharedPage.verifyTags(testDocument.tags);
		}
	});

	test('should display shared document with proper layout', async ({
		page,
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		// Create share link
		await documentViewPage.navigateToDocument(testDocument.path!);
		const shareUrl = await documentViewPage.createShareLink();
		await documentViewPage.closeShareModal();

		const token = shareUrl.split('/share/')[1];
		const sharedPage = new SharedDocumentPage(page);

		await sharedPage.navigateToSharedDocument(token);
		await sharedPage.verifySharedDocumentLoaded(testDocument.title);

		// Verify minimal layout (no main app navigation)
		await sharedPage.verifyMinimalLayout();

		// Verify read-only mode (no edit/share/delete buttons)
		await sharedPage.verifyReadOnlyMode();

		// Verify no authentication is required
		await sharedPage.verifyNoAuthenticationRequired();

		// Verify page title
		await sharedPage.verifyPageTitle(testDocument.title);

		// Verify document metadata
		await sharedPage.verifyMetadata();

		// Verify document path is shown
		await sharedPage.verifyDocumentPath(testDocument.path!);
	});

	test('should handle invalid share tokens', async ({ page }) => {
		const sharedPage = new SharedDocumentPage(page);

		// Try accessing with invalid token
		const invalidToken = 'invalid-token-123';
		await sharedPage.navigateToSharedDocument(invalidToken);

		// Should show not found error
		await sharedPage.verifyNotFound();
	});

	test('should handle malformed share tokens', async ({ page }) => {
		const sharedPage = new SharedDocumentPage(page);

		// Try accessing with malformed token (wrong length)
		const malformedToken = 'abc123';
		await sharedPage.navigateToSharedDocument(malformedToken);

		// Should show not found error
		await sharedPage.verifyNotFound();
	});

	test('should work with complex document content', async ({
		page,
		editorPage,
		documentViewPage,
		testId
	}) => {
		// Create a document with complex content
		const complexDocument = createTestDocument({
			title: `Complex Share Test ${testId}`,
			content: `# Complex Document

This document contains various elements:

## Code Block
\`\`\`javascript
function hello() {
  console.log("Hello from shared document!");
}
\`\`\`

## List
- Item 1
- Item 2
- Item 3

## Link
[Test Link](https://example.com)

## Image
![Test Image](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHZpZXdCb3g9IjAgMCAxMCAxMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjREREIi8+Cjwvc3ZnPgo=)

## Bold and Italic
**Bold text** and *italic text*
`,
			tags: ['complex', 'test', 'sharing']
		});

		// Create the document
		await editorPage.navigateToNew();
		await editorPage.fillDocumentDetails(
			complexDocument.title,
			complexDocument.content,
			complexDocument.tags!
		);
		await editorPage.saveAndExpectNavigation();

		// Create share link
		const shareUrl = await documentViewPage.createShareLink();
		await documentViewPage.closeShareModal();

		// Access shared document
		const token = shareUrl.split('/share/')[1];
		const sharedPage = new SharedDocumentPage(page);

		await sharedPage.navigateToSharedDocument(token);
		await sharedPage.verifySharedDocumentLoaded(complexDocument.title);

		// Verify various content elements
		await sharedPage.verifyHeading('Complex Document', 1);
		await sharedPage.verifyHeading('Code Block', 2);
		await sharedPage.verifyHeading('List', 2);
		await sharedPage.verifyContentContains('function hello()');
		await sharedPage.verifyContentContains('Item 1');
		await sharedPage.verifyContentContains('Bold text');
		await sharedPage.verifyTags(['complex', 'test', 'sharing']);
	});

	test('should work with empty document', async ({
		page,
		editorPage,
		documentViewPage,
		testId
	}) => {
		// Create an empty document
		const emptyDocument = createTestDocument({
			title: `Empty Share Test ${testId}`,
			content: '',
			tags: []
		});

		await editorPage.navigateToNew();
		await editorPage.fillDocumentDetails(
			emptyDocument.title,
			emptyDocument.content,
			emptyDocument.tags!
		);
		await editorPage.saveAndExpectNavigation();

		// Create share link
		const shareUrl = await documentViewPage.createShareLink();
		await documentViewPage.closeShareModal();

		// Access shared document
		const token = shareUrl.split('/share/')[1];
		const sharedPage = new SharedDocumentPage(page);

		await sharedPage.navigateToSharedDocument(token);
		await sharedPage.verifySharedDocumentLoaded(emptyDocument.title);

		// Verify empty state message
		await expect(sharedPage.page.getByText(/no content yet/i)).toBeVisible();
	});

	test('should handle concurrent share creation', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		await documentViewPage.navigateToDocument(testDocument.path!);

		// Open share modal
		await documentViewPage.openShareModal();

		// Create multiple shares quickly
		const modal = documentViewPage.page.locator('[role="dialog"]').filter({ hasText: 'Share' });
		const createButton = modal.getByRole('button', { name: /create share link/i });

		// Click create button multiple times rapidly
		await Promise.all([createButton.click(), createButton.click(), createButton.click()]);

		// Wait for all requests to complete
		await documentViewPage.page.waitForTimeout(2000);

		// Should have at least one share (might be more depending on race conditions)
		const activeLinks = await documentViewPage.getActiveShareLinks();
		expect(activeLinks.length).toBeGreaterThanOrEqual(1);

		// All links should be unique
		const uniqueLinks = [...new Set(activeLinks)];
		expect(uniqueLinks).toHaveLength(activeLinks.length);

		await documentViewPage.closeShareModal();
	});

	test('should print shared documents', async ({
		page,
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		// Create share link
		await documentViewPage.navigateToDocument(testDocument.path!);
		const shareUrl = await documentViewPage.createShareLink();
		await documentViewPage.closeShareModal();

		const token = shareUrl.split('/share/')[1];
		const sharedPage = new SharedDocumentPage(page);

		await sharedPage.navigateToSharedDocument(token);
		await sharedPage.verifySharedDocumentLoaded(testDocument.title);

		// Test print button (we can't test actual printing, but can test button exists)
		await expect(sharedPage.printButton).toBeVisible();

		// The print functionality triggers window.print() which we can't easily test
		// but we can at least verify the button doesn't throw errors
		// We'll just check that it's clickable
		await expect(sharedPage.printButton).toBeEnabled();
	});

	test('should handle share modal with multiple documents', async ({
		page,
		editorPage,
		documentViewPage,
		testId
	}) => {
		// Create first document and share it
		const doc1 = createTestDocument({
			title: `Multi-Doc Test 1 ${testId}`,
			content: 'Content for document 1',
			tags: ['test1']
		});

		await editorPage.navigateToNew();
		await editorPage.fillDocumentDetails(doc1.title, doc1.content, doc1.tags!);
		await editorPage.saveAndExpectNavigation();

		const shareUrl1 = await documentViewPage.createShareLink();
		await documentViewPage.closeShareModal();

		// Create second document and share it
		const doc2 = createTestDocument({
			title: `Multi-Doc Test 2 ${testId}`,
			content: 'Content for document 2',
			tags: ['test2']
		});

		await editorPage.navigateToNew();
		await editorPage.fillDocumentDetails(doc2.title, doc2.content, doc2.tags!);
		await editorPage.saveAndExpectNavigation();

		const shareUrl2 = await documentViewPage.createShareLink();
		await documentViewPage.closeShareModal();

		// Verify both shared documents work independently
		const sharedPage = new SharedDocumentPage(page);

		// Test first document
		const token1 = shareUrl1.split('/share/')[1];
		await sharedPage.navigateToSharedDocument(token1);
		await sharedPage.verifySharedDocumentLoaded(doc1.title);
		await sharedPage.verifyContentContains(doc1.content);

		// Test second document
		const token2 = shareUrl2.split('/share/')[1];
		await sharedPage.navigateToSharedDocument(token2);
		await sharedPage.verifySharedDocumentLoaded(doc2.title);
		await sharedPage.verifyContentContains(doc2.content);
	});

	test('should show proper error for revoked shares', async ({
		page,
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		// Create share link
		await documentViewPage.navigateToDocument(testDocument.path!);
		const shareUrl = await documentViewPage.createShareLink();

		// Revoke the share immediately
		await documentViewPage.revokeShareLink(0);
		await documentViewPage.closeShareModal();

		// Try to access the revoked share
		const token = shareUrl.split('/share/')[1];
		const sharedPage = new SharedDocumentPage(page);

		await sharedPage.navigateToSharedDocument(token);

		// Should show not found error
		await sharedPage.verifyNotFound();
	});
});

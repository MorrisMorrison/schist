import { test, expect } from '../fixtures';
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

	test.skip('should create share links with different expiry options', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		await documentViewPage.navigateToDocument(testDocument.path!);

		const expiryOptions = [1, 7, 30, 90, 0];
		const shareUrls: string[] = [];

		for (const expiry of expiryOptions) {
			const shareUrl = await documentViewPage.createShareLink(expiry);
			shareUrls.push(shareUrl);

			expect(shareUrl).toMatch(/\/share\/[a-f0-9]{64}$/);
			expect(shareUrls.filter((url) => url === shareUrl)).toHaveLength(1);
			await documentViewPage.closeShareModal();
		}

		await documentViewPage.openShareModal();

		const activeLinks = await documentViewPage.getActiveShareLinks();
		expect(activeLinks).toHaveLength(expiryOptions.length);

		await documentViewPage.closeShareModal();
	});

	test.skip('should revoke share links', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		await documentViewPage.navigateToDocument(testDocument.path!);

		await documentViewPage.createShareLink(7);
		await documentViewPage.closeShareModal();
		await documentViewPage.createShareLink(90);

		let activeLinks = await documentViewPage.getActiveShareLinks();
		expect(activeLinks).toHaveLength(2);

		const token = activeLinks[0].split('/share/')[1];
		expect(token).toMatch(/^[a-f0-9]{64}$/);

		await documentViewPage.revokeShareLink(0);

		const modal = documentViewPage.page.locator('[role="dialog"]').filter({ hasText: 'Share' });
		await expect(modal.getByText(/revoked successfully/i)).toBeVisible();

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

	test.skip('should handle invalid share tokens', async ({ page }) => {
		const sharedPage = new SharedDocumentPage(page);

		const invalidToken = 'invalid-token-123';
		await sharedPage.navigateToSharedDocument(invalidToken);

		await sharedPage.verifyNotFound();
	});

	test.skip('should show proper error for revoked shares', async ({
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

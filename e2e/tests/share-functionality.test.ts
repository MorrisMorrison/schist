import { test, expect } from '../fixtures';
import { shareToken } from '../pages/SharedDocumentPage';

test.describe.serial('Share Functionality', () => {
	test('should open share modal from document view', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		// Navigate to the document
		await documentViewPage.openDocument(testDocument);

		// Click share button
		await documentViewPage.openShareModal();

		// Verify modal content
		const modal = documentViewPage.shareModal;
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
		await documentViewPage.openDocument(testDocument);

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
		await documentViewPage.openDocument(testDocument);

		const expiryOptions = [1, 7, 30, 90, 0];
		const shareUrls: string[] = [];

		for (const expiry of expiryOptions) {
			const shareUrl = await documentViewPage.createShareLink(expiry);
			shareUrls.push(shareUrl);

			expect(shareUrl).toMatch(/\/share\/[a-f0-9]{64}$/);
			await documentViewPage.closeShareModal();
		}

		// Check that all URLs are unique
		const uniqueUrls = [...new Set(shareUrls)];
		expect(uniqueUrls).toHaveLength(expiryOptions.length);

		await documentViewPage.openShareModal();

		const activeLinks = await documentViewPage.getActiveShareLinks();
		expect(activeLinks).toHaveLength(expiryOptions.length);

		await documentViewPage.closeShareModal();
	});

	test('should revoke share links', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		await documentViewPage.openDocument(testDocument);

		await documentViewPage.createShareLink(7);
		await documentViewPage.closeShareModal();
		await documentViewPage.createShareLink(90);

		let activeLinks = await documentViewPage.getActiveShareLinks();
		expect(activeLinks).toHaveLength(2);

		// Each link carries a 64-hex-character token.
		shareToken(activeLinks[0]);

		await documentViewPage.revokeShareLink(0);

		const modal = documentViewPage.shareModal;
		await expect(modal.getByText(/revoked successfully/i)).toBeVisible();

		activeLinks = await documentViewPage.getActiveShareLinks();
		expect(activeLinks).toHaveLength(1);

		await documentViewPage.closeShareModal();
	});

	test('should access shared document without authentication', async ({
		sharedDocumentPage: sharedPage,
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		// Create share link while authenticated
		await documentViewPage.openDocument(testDocument);
		const shareUrl = await documentViewPage.createShareLink();
		await documentViewPage.closeShareModal();

		// Navigate to shared document (this should work without authentication)
		await sharedPage.navigateToShareUrl(shareUrl);

		// Verify shared document is loaded
		await sharedPage.verifySharedDocumentLoaded(testDocument.title);
	});

	test('should display shared document with proper layout', async ({
		sharedDocumentPage: sharedPage,
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		// Create share link
		await documentViewPage.openDocument(testDocument);
		const shareUrl = await documentViewPage.createShareLink();
		await documentViewPage.closeShareModal();

		await sharedPage.navigateToShareUrl(shareUrl);
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

	test('should handle invalid share tokens', async ({ sharedDocumentPage: sharedPage }) => {
		const invalidToken = 'invalid-token-123';
		await sharedPage.navigateToSharedDocument(invalidToken);

		await sharedPage.verifyNotFound();
	});

	test('should show proper error for revoked shares', async ({
		sharedDocumentPage: sharedPage,
		documentViewPage,
		withSimpleTestDocument: testDocument
	}) => {
		// Create share link
		await documentViewPage.openDocument(testDocument);
		const shareUrl = await documentViewPage.createShareLink();

		// Revoke the share immediately
		await documentViewPage.revokeShareLink(0);
		await documentViewPage.closeShareModal();

		// Try to access the revoked share
		await sharedPage.navigateToShareUrl(shareUrl);

		// Should show not found error
		await sharedPage.verifyNotFound();
	});
});

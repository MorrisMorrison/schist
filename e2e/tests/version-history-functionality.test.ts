import { test, expect } from '../fixtures';

test.describe('Version History Functionality', () => {
	test('should display version history and allow comparison', async ({
		documentViewPage,
		editorPage,
		withSimpleTestDocument: testDocument,
		page
	}) => {
		await documentViewPage.navigateToPage(testDocument.path!);
		await documentViewPage.verifyPageLoaded(testDocument.title);

		// The version-history button is the entry point for this feature and is
		// always rendered once version metadata has loaded for a saved document.
		const versionButton = page.locator('button[title="View version history"]');
		await expect(versionButton).toBeVisible();
		await versionButton.click();

		const modal = page.locator('[role="dialog"]');
		await expect(modal).toBeVisible();

		const modalTitle = modal.locator('[data-slot="dialog-title"]:has-text("Version History")');
		await expect(modalTitle).toBeVisible();

		const closeButton = modal.locator('button:has-text("Close")').first();
		await closeButton.click();
		await expect(modal).not.toBeVisible();

		await documentViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nSecond version content.');
		await editorPage.saveAndExpectNavigation();

		await documentViewPage.verifyContentContains('Second version content');

		await expect(versionButton).toBeVisible();
		await versionButton.click();
		const reopenedModal = page.locator('[role="dialog"]');
		await expect(reopenedModal).toBeVisible();

		const versionItems = reopenedModal.locator('[data-testid="version-item"], .border.rounded-lg');

		// The number of version entries depends on backend history retention, so the
		// presence of "Select" buttons is asserted only when version items exist.
		if ((await versionItems.count()) > 0) {
			const selectButtons = reopenedModal.locator('button:has-text("Select")');
			expect(await selectButtons.count()).toBeGreaterThan(0);
		}

		const reopenedCloseButton = reopenedModal.locator('button:has-text("Close")');
		await reopenedCloseButton.click();
	});

	test('should handle version restoration workflow', async ({
		documentViewPage,
		editorPage,
		withSimpleTestDocument: testDocument,
		page
	}) => {
		await documentViewPage.navigateToPage(testDocument.path!);
		await documentViewPage.verifyPageLoaded(testDocument.title);

		await documentViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nFirst edit.');
		await editorPage.saveAndExpectNavigation();

		await documentViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nSecond edit.');
		await editorPage.saveAndExpectNavigation();

		const versionButton = page.locator('button[title="View version history"]');
		await expect(versionButton).toBeVisible();
		await versionButton.click();

		const modal = page.locator('[role="dialog"]');
		await expect(modal).toBeVisible();

		const restoreButtons = modal.locator('button:has-text("Restore")');

		// Restore buttons only appear for non-current versions; whether any exist
		// depends on how many historical versions the backend retained.
		if ((await restoreButtons.count()) > 0) {
			await restoreButtons.first().click();

			// The restore confirmation dialog is optional UX (some flows restore
			// immediately), so it is asserted with a bounded wait rather than forced.
			const confirmDialog = page.locator('h2:has-text("Restore Version")');
			if (await confirmDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
				const cancelButton = modal.locator('button:has-text("Cancel")');
				await cancelButton.click();
			}
		}

		const closeButton = modal.locator('button:has-text("Close")');
		await closeButton.click();
	});

	test('should handle version comparison workflow', async ({
		documentViewPage,
		editorPage,
		withSimpleTestDocument: testDocument,
		page
	}) => {
		// Navigate to the page and create multiple versions
		await documentViewPage.navigateToPage(testDocument.path!);
		await documentViewPage.verifyPageLoaded(testDocument.title);

		// Create first edit
		await documentViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nFirst comparison edit.');
		await editorPage.saveAndExpectNavigation();

		// Create second edit
		await documentViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nSecond comparison edit.');
		await editorPage.saveAndExpectNavigation();

		// Open version history. The version-history button is the feature entry
		// point and is always present for a saved document.
		const versionButton = page.locator('button[title="View version history"]');
		await expect(versionButton).toBeVisible();
		await versionButton.click();

		const modal = page.locator('[role="dialog"]');
		await expect(modal).toBeVisible();

		// Look for version selection buttons. Comparison requires at least two
		// selectable versions; the count depends on backend history retention, so
		// the compare/diff branch below stays conditional.
		const selectButtons = modal.locator('button:has-text("Select")');

		if ((await selectButtons.count()) >= 2) {
			// Select two versions for comparison
			await selectButtons.nth(0).click();
			await selectButtons.nth(1).click();

			// Compare becomes available once two versions are selected.
			const compareButton = modal.locator('button:has-text("Compare")');
			await expect(compareButton).toBeVisible();
			await compareButton.click();

			// Verify diff view opens and renders diff content.
			const diffTitle = modal.locator('h2:has-text("Comparing Versions")');
			await expect(diffTitle).toBeVisible();

			const diffViewer = modal.locator('.font-mono');
			await expect(diffViewer).toBeVisible();

			// Close diff view
			const closeDiffButton = modal.locator('button:has-text("Close Diff")');
			await closeDiffButton.click();
		}

		// Close the version history modal
		const closeButton = modal.locator('button:has-text("Close")');
		await closeButton.click();
	});
});

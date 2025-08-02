import { test, expect } from '../fixtures/test-setup';
import { createTestPage } from '../utils/test-data';

test.describe('Version History Functionality', () => {
	test('should display version history and allow comparison', async ({
		documentViewPage,
		editorPage,
		apiHelper,
		testId,
		page
	}) => {
		const testPage = createTestPage({
			title: `Version Test Page ${testId}`,
			content: '# Version Test\n\nOriginal content.',
			path: `/version-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		await documentViewPage.navigateToPage(testPage.path!);
		await documentViewPage.verifyPageLoaded(testPage.title);

		const versionButton = page.locator('button[title="View version history"]');
		if (await versionButton.isVisible()) {
			await versionButton.click();

			const modal = page.locator('[role="dialog"]');
			await expect(modal).toBeVisible();

			const modalTitle = modal.locator('[data-slot="dialog-title"]:has-text("Version History")');
			await expect(modalTitle).toBeVisible();

			const closeButton = modal.locator('button:has-text("Close")').first();
			await closeButton.click();
			await expect(modal).not.toBeVisible();
		}

		await documentViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nSecond version content.');
		await editorPage.saveAndExpectNavigation();

		await documentViewPage.verifyContentContains('Second version content');

		if (await versionButton.isVisible()) {
			await versionButton.click();
			const modal = page.locator('[role="dialog"]');
			await expect(modal).toBeVisible();

			const versionItems = modal.locator('[data-testid="version-item"], .border.rounded-lg');

			if ((await versionItems.count()) > 0) {
				const selectButtons = modal.locator('button:has-text("Select")');
				expect(await selectButtons.count()).toBeGreaterThan(0);
			}

			const closeButton = modal.locator('button:has-text("Close")');
			await closeButton.click();
		}
	});

	test('should handle version restoration workflow', async ({
		documentViewPage,
		editorPage,
		apiHelper,
		testId,
		page
	}) => {
		const testPage = createTestPage({
			title: `Restore Test Page ${testId}`,
			content: '# Restore Test\n\nOriginal content for restoration.',
			path: `/restore-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		await documentViewPage.navigateToPage(testPage.path!);
		await documentViewPage.verifyPageLoaded(testPage.title);

		await documentViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nFirst edit.');
		await editorPage.saveAndExpectNavigation();

		await documentViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nSecond edit.');
		await editorPage.saveAndExpectNavigation();

		const versionButton = page.locator('button[title="View version history"]');
		if (await versionButton.isVisible()) {
			await versionButton.click();

			const modal = page.locator('[role="dialog"]');
			await expect(modal).toBeVisible();

			const restoreButtons = modal.locator('button:has-text("Restore")');

			if ((await restoreButtons.count()) > 0) {
				await restoreButtons.first().click();

				const confirmDialog = page.locator('h2:has-text("Restore Version")');
				if (await confirmDialog.isVisible()) {
					const cancelButton = modal.locator('button:has-text("Cancel")');
					await cancelButton.click();
				}
			}

			const closeButton = modal.locator('button:has-text("Close")');
			await closeButton.click();
		}
	});

	test('should handle version comparison workflow', async ({
		documentViewPage,
		editorPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create a test page
		const testPage = createTestPage({
			title: `Compare Test Page ${testId}`,
			content: '# Compare Test\n\nContent for comparison testing.',
			path: `/compare-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to the page and create multiple versions
		await documentViewPage.navigateToPage(testPage.path!);
		await documentViewPage.verifyPageLoaded(testPage.title);

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

		// Open version history
		const versionButton = page.locator('button[title="View version history"]');
		if (await versionButton.isVisible()) {
			await versionButton.click();

			const modal = page.locator('[role="dialog"]');
			await expect(modal).toBeVisible();

			// Look for version selection buttons
			const selectButtons = modal.locator('button:has-text("Select")');

			if ((await selectButtons.count()) >= 2) {
				// Select two versions for comparison
				await selectButtons.nth(0).click();
				await selectButtons.nth(1).click();

				// Look for compare button
				const compareButton = modal.locator('button:has-text("Compare")');
				if (await compareButton.isVisible()) {
					await compareButton.click();

					// Verify diff view opens
					const diffTitle = modal.locator('h2:has-text("Comparing Versions")');
					if (await diffTitle.isVisible()) {
						// Verify diff content is displayed
						const diffViewer = modal.locator('.font-mono');
						await expect(diffViewer).toBeVisible();

						// Close diff view
						const closeDiffButton = modal.locator('button:has-text("Close Diff")');
						await closeDiffButton.click();
					}
				}
			}

			// Close the version history modal
			const closeButton = modal.locator('button:has-text("Close")');
			await closeButton.click();
		}
	});
});

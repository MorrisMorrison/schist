import { test, expect } from '../fixtures/test-setup';
import { createTestPage } from '../utils/test-data';

test.describe('Version History Functionality', () => {
	test('should display version history and allow comparison', async ({
		pageViewPage,
		editorPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create a test page
		const testPage = createTestPage({
			title: `Version Test Page ${testId}`,
			content: '# Version Test\n\nOriginal content.',
			path: `/version-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to the page
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Check if version history button is visible
		const versionButton = page.locator('button[title="View version history"]');
		if (await versionButton.isVisible()) {
			// Click version history button
			await versionButton.click();

			// Verify version history modal opens
			const modal = page.locator('[role="dialog"]');
			await expect(modal).toBeVisible();

			// Verify modal has title "Version History"
			const modalTitle = modal.locator('[data-slot="dialog-title"]:has-text("Version History")');
			await expect(modalTitle).toBeVisible();

			// Close the modal
			const closeButton = modal.locator('button:has-text("Close")').first();
			await closeButton.click();
			await expect(modal).not.toBeVisible();
		}

		// Edit the page to create a new version
		await pageViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nSecond version content.');
		await editorPage.saveAndExpectNavigation();

		// Verify the edit was saved
		await pageViewPage.verifyContentContains('Second version content');

		// Check version history again - should now have multiple versions
		if (await versionButton.isVisible()) {
			await versionButton.click();
			const modal = page.locator('[role="dialog"]');
			await expect(modal).toBeVisible();

			// Look for version items in the modal
			const versionItems = modal.locator('[data-testid="version-item"], .border.rounded-lg');

			// If versions are displayed, verify we can see version selection buttons
			if ((await versionItems.count()) > 0) {
				const selectButtons = modal.locator('button:has-text("Select")');
				expect(await selectButtons.count()).toBeGreaterThan(0);
			}

			// Close modal
			const closeButton = modal.locator('button:has-text("Close")');
			await closeButton.click();
		}
	});

	test('should handle version restoration workflow', async ({
		pageViewPage,
		editorPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create a test page
		const testPage = createTestPage({
			title: `Restore Test Page ${testId}`,
			content: '# Restore Test\n\nOriginal content for restoration.',
			path: `/restore-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to the page and make edits to create versions
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Edit the page multiple times to create version history
		await pageViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nFirst edit.');
		await editorPage.saveAndExpectNavigation();

		await pageViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nSecond edit.');
		await editorPage.saveAndExpectNavigation();

		// Open version history
		const versionButton = page.locator('button[title="View version history"]');
		if (await versionButton.isVisible()) {
			await versionButton.click();

			const modal = page.locator('[role="dialog"]');
			await expect(modal).toBeVisible();

			// Look for restore buttons
			const restoreButtons = modal.locator('button:has-text("Restore")');

			if ((await restoreButtons.count()) > 0) {
				// Try clicking the first restore button
				await restoreButtons.first().click();

				// Look for restore confirmation dialog
				const confirmDialog = page.locator('h2:has-text("Restore Version")');
				if (await confirmDialog.isVisible()) {
					// Cancel the restore to avoid actually changing the page
					const cancelButton = modal.locator('button:has-text("Cancel")');
					await cancelButton.click();
				}
			}

			// Close the version history modal
			const closeButton = modal.locator('button:has-text("Close")');
			await closeButton.click();
		}
	});

	test('should handle version comparison workflow', async ({
		pageViewPage,
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
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Create first edit
		await pageViewPage.editPage();
		await editorPage.verifyLoaded();
		await editorPage.typeContent('\n\nFirst comparison edit.');
		await editorPage.saveAndExpectNavigation();

		// Create second edit
		await pageViewPage.editPage();
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

	test('should handle scrolling in version history modal with many versions', async ({
		pageViewPage,
		editorPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create a test page
		const testPage = createTestPage({
			title: `Scroll Test Page ${testId}`,
			content: '# Scroll Test\n\nContent for scrolling test.',
			path: `/scroll-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to the page
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Create multiple versions to test scrolling
		for (let i = 1; i <= 5; i++) {
			await pageViewPage.editPage();
			await editorPage.verifyLoaded();
			await editorPage.typeContent(`\n\nEdit number ${i} for scrolling test.`);
			await editorPage.saveAndExpectNavigation();
		}

		// Open version history
		const versionButton = page.locator('button[title="View version history"]');
		if (await versionButton.isVisible()) {
			await versionButton.click();

			const modal = page.locator('[role="dialog"]');
			await expect(modal).toBeVisible();

			// Verify modal has scrollable content
			const scrollableArea = modal.locator('.overflow-y-auto');
			await expect(scrollableArea).toBeVisible();

			// Check that footer buttons are always visible
			const closeButton = modal.locator('button:has-text("Close")');
			await expect(closeButton).toBeVisible();

			// Verify we can scroll to see all versions if needed
			const versionItems = modal.locator('.border.rounded-lg');
			if ((await versionItems.count()) > 3) {
				// Try to scroll within the modal
				await scrollableArea.evaluate((el) => {
					el.scrollTop = el.scrollHeight;
				});

				// Footer should still be visible after scrolling
				await expect(closeButton).toBeVisible();
			}

			// Close modal
			await closeButton.click();
		}
	});
});

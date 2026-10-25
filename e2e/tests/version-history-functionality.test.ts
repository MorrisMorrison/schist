import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import type { DocumentViewPage, EditorPage } from '../fixtures';

/**
 * Version history lives in a dialog opened from the document header. Every
 * document created through the API and every manual save is a git commit, so a
 * document that has been edited N times has N + 1 versions.
 */
function versionHistory(page: Page) {
	const dialog = page.getByRole('dialog');
	return {
		// Rendered only once the version count has loaded ("Loading versions..."
		// replaces it until then), so wait on it rather than probing isVisible().
		openButton: page.getByRole('button', { name: 'View document version history' }),
		dialog,
		title: dialog.locator('[data-slot="dialog-title"]'),
		// Each version row has a toggle labelled "Select", or "Selected" once picked.
		selectButtons: dialog.getByRole('button', { name: /^Select(ed)?$/ }),
		restoreButtons: dialog.getByRole('button', { name: 'Restore', exact: true }),
		// The dialog has two buttons named "Close": the corner X (an sr-only
		// "Close" label) and the footer button. Scope to the footer.
		footerCloseButton: dialog
			.locator('[data-slot="dialog-footer"]')
			.getByRole('button', { name: 'Close', exact: true })
	};
}

async function openVersionHistory(page: Page) {
	const history = versionHistory(page);
	await expect(history.openButton).toBeVisible();
	await history.openButton.click();
	await expect(history.dialog).toBeVisible();
	await expect(history.title).toHaveText('Version History');
	return history;
}

async function closeVersionHistory(page: Page) {
	const history = versionHistory(page);
	await history.footerCloseButton.click();
	await expect(history.dialog).toBeHidden();
}

async function appendAndSave(
	documentViewPage: DocumentViewPage,
	editorPage: EditorPage,
	text: string
) {
	await documentViewPage.editDocument();
	await editorPage.verifyLoaded();
	await editorPage.typeContent(text);
	await editorPage.saveAndExpectNavigation();
	await documentViewPage.verifyContentContains(text.trim());
}

test.describe('Version History Functionality', () => {
	test('should display version history and allow comparison', async ({
		documentViewPage,
		editorPage,
		withSimpleTestDocument: testDocument,
		page
	}) => {
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// A freshly created document already has its creation commit.
		let history = await openVersionHistory(page);
		await expect(history.selectButtons.first()).toBeVisible();
		await closeVersionHistory(page);

		await appendAndSave(documentViewPage, editorPage, '\n\nSecond version content.');

		// Creation + one manual save: at least two selectable versions.
		history = await openVersionHistory(page);
		await expect(history.selectButtons.nth(1)).toBeVisible();
		await closeVersionHistory(page);
	});

	test('should handle version restoration workflow', async ({
		documentViewPage,
		editorPage,
		withSimpleTestDocument: testDocument,
		page
	}) => {
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		await appendAndSave(documentViewPage, editorPage, '\n\nFirst edit.');
		await appendAndSave(documentViewPage, editorPage, '\n\nSecond edit.');

		const history = await openVersionHistory(page);
		await expect(history.restoreButtons.nth(1)).toBeVisible();

		// Restore asks for confirmation in place of the list...
		await history.restoreButtons.last().click();
		await expect(history.title).toHaveText('Restore Version');

		// ...and cancelling returns to the list without restoring anything.
		await history.dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(history.title).toHaveText('Version History');

		await closeVersionHistory(page);
		await documentViewPage.verifyContentContains('Second edit.');
	});

	test('should handle version comparison workflow', async ({
		documentViewPage,
		editorPage,
		withSimpleTestDocument: testDocument,
		page
	}) => {
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		await appendAndSave(documentViewPage, editorPage, '\n\nFirst comparison edit.');
		await appendAndSave(documentViewPage, editorPage, '\n\nSecond comparison edit.');

		const history = await openVersionHistory(page);
		await expect(history.selectButtons.nth(1)).toBeVisible();

		// Select two versions for comparison.
		await history.selectButtons.nth(0).click();
		await history.selectButtons.nth(1).click();
		await expect(history.selectButtons.nth(0)).toHaveText('Selected');
		await expect(history.selectButtons.nth(1)).toHaveText('Selected');

		await history.dialog.getByRole('button', { name: 'Compare', exact: true }).click();
		await expect(history.title).toHaveText('Comparing Versions');

		// Leaving the diff returns to the list.
		await history.dialog.getByRole('button', { name: 'Close Diff', exact: true }).click();
		await expect(history.title).toHaveText('Version History');

		await closeVersionHistory(page);
	});
});

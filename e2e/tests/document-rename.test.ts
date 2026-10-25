import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

/**
 * Open the rename modal for a document through its folder-tree context menu.
 * The document must already be in the tree (it is created by a fixture), so
 * its presence is a precondition rather than an optional path.
 */
async function openRenameModal(page: Page, documentTitle: string) {
	const documentTreeItem = page.getByTestId('folder-tree').getByText(documentTitle);
	await expect(documentTreeItem).toBeVisible();
	await documentTreeItem.click({ button: 'right' });

	// The document context menu has role="menu" but, unlike the folder menu, no test id.
	const contextMenu = page.getByRole('menu');
	await expect(contextMenu).toBeVisible();
	await contextMenu.getByText(/rename/i).click();

	const renameInput = page.getByTestId('document-name');
	await expect(renameInput).toBeVisible();
	return { documentTreeItem, renameInput, submitButton: page.getByTestId('rename-document-btn') };
}

test.describe.serial('Document Rename', () => {
	test('should rename document via context menu', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument,
		testId,
		page
	}) => {
		// Navigate to root to see document in folder tree
		await documentViewPage.navigateToDocument('/');

		const { renameInput, submitButton } = await openRenameModal(page, testDocument.title);

		// Enter new name
		const newTitle = `Renamed Test Document ${testId}`;
		await renameInput.fill(newTitle);

		await submitButton.click();
		await expect(renameInput).toBeHidden();

		// Verify document was renamed - the new title appears in the tree
		const renamedDocumentItem = page.getByTestId('folder-tree').getByText(newTitle);
		await expect(renamedDocumentItem).toBeVisible();

		// Navigate to the document and verify title changed
		await renamedDocumentItem.click();
		await documentViewPage.verifyDocumentLoaded(newTitle);
	});

	test('should handle document rename validation', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument,
		testId,
		page
	}) => {
		// Open the rename modal via the same proven entry point as the happy-path
		// test: the document's folder-tree context menu.
		await documentViewPage.navigateToDocument('/');

		const {
			documentTreeItem,
			renameInput,
			submitButton: saveButton
		} = await openRenameModal(page, testDocument.title);
		await expect(saveButton).toBeVisible();

		// An empty title is invalid: the submit button must be disabled so the
		// rename cannot be performed.
		await renameInput.fill('');
		await expect(saveButton).toBeDisabled();

		// A whitespace-only title is also invalid and keeps submit disabled.
		await renameInput.fill('   ');
		await expect(saveButton).toBeDisabled();

		// A genuinely new, valid title re-enables submit, proving the disabled
		// states above were driven by validation rather than a permanently dead button.
		await renameInput.fill(`Valid Renamed Title ${testId}`);
		await expect(saveButton).toBeEnabled();

		// Cancel without applying the change.
		const cancelButton = page.getByRole('button', { name: /cancel/i });
		await expect(cancelButton).toBeVisible();
		await cancelButton.click();

		// Verify original document is unchanged.
		await documentTreeItem.click();
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
	});

	test('should preserve document metadata during rename', async ({
		documentViewPage,
		withComplexTestDocument: testDocument,
		testId,
		page
	}) => {
		await documentViewPage.openDocument(testDocument);

		// Verify original tags are present
		await documentViewPage.verifyTags(testDocument.tags!);

		// Rename the document via its folder-tree context menu (the proven entry
		// point exercised by the happy-path test above).
		const { renameInput, submitButton } = await openRenameModal(page, testDocument.title);

		const newTitle = `Renamed Metadata Test ${testId}`;
		await renameInput.fill(newTitle);

		await submitButton.click();
		await expect(renameInput).toBeHidden();

		// Verify document renamed successfully
		await documentViewPage.verifyDocumentLoaded();

		// Verify tags are still present after rename
		await documentViewPage.verifyTags(testDocument.tags!);
	});
});

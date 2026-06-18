import { test, expect } from '../fixtures';

test.describe.serial('Document Rename', () => {
	test('should rename document via context menu', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument,
		testId,
		page
	}) => {
		// Navigate to root to see document in folder tree
		await documentViewPage.navigateToDocument('/');

		// Find document in sidebar tree. The document was created via the fixture
		// and must appear in the tree for the context-menu rename flow to be
		// testable, so its presence is a precondition rather than an optional path.
		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');
		const documentTreeItem = folderTree.getByText(testDocument.title);
		await expect(documentTreeItem).toBeVisible();

		// Right-click on document in tree to open context menu
		await documentTreeItem.click({ button: 'right' });

		// Look for rename option in context menu
		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const renameOption = contextMenu.getByText(/rename/i);
		await expect(renameOption).toBeVisible();
		await renameOption.click();

		// Should open rename modal or inline editor
		const renameInput = page.getByTestId('document-name');
		await expect(renameInput).toBeVisible();

		// Enter new name
		const newTitle = `Renamed Test Document ${testId}`;
		await renameInput.fill(newTitle);

		// Confirm rename. A dedicated confirm button is the primary affordance, but
		// some builds confirm on Enter, so the keyboard fallback stays conditional.
		const confirmButton = page.getByTestId('rename-document-btn');
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
		} else {
			await renameInput.press('Enter');
		}

		await page.waitForLoadState('networkidle');

		// Verify document was renamed - the new title appears in the tree
		const renamedDocumentItem = folderTree.getByText(newTitle);
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

		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');
		const documentTreeItem = folderTree.getByText(testDocument.title);
		await expect(documentTreeItem).toBeVisible();

		await documentTreeItem.click({ button: 'right' });

		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const renameOption = contextMenu.getByText(/rename/i);
		await expect(renameOption).toBeVisible();
		await renameOption.click();

		const renameInput = page.getByTestId('document-name');
		await expect(renameInput).toBeVisible();

		const saveButton = page.getByTestId('rename-document-btn');
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
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// Verify original tags are present
		await documentViewPage.verifyTags(testDocument.tags!);

		// Rename the document via its folder-tree context menu (the proven entry
		// point exercised by the happy-path test above).
		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');
		const documentTreeItem = folderTree.getByText(testDocument.title);
		await expect(documentTreeItem).toBeVisible();

		await documentTreeItem.click({ button: 'right' });

		const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
		await expect(contextMenu).toBeVisible({ timeout: 2000 });

		const renameOption = contextMenu.getByText(/rename/i);
		await expect(renameOption).toBeVisible();
		await renameOption.click();

		const renameInput = page.getByTestId('document-name');
		await expect(renameInput).toBeVisible();

		const newTitle = `Renamed Metadata Test ${testId}`;
		await renameInput.fill(newTitle);

		const confirmButton = page.getByTestId('rename-document-btn');
		await expect(confirmButton).toBeVisible();
		await confirmButton.click();
		await page.waitForLoadState('networkidle');

		// Verify document renamed successfully
		await documentViewPage.verifyDocumentLoaded();

		// Verify tags are still present after rename
		await documentViewPage.verifyTags(testDocument.tags!);
	});
});

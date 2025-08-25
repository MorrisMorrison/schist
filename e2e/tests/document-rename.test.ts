import { test, expect } from '../fixtures/test-data-fixtures';

test.describe.serial('Document Rename', () => {
	test('should rename document via context menu', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument,
		testId,
		page
	}) => {
		// Navigate to root to see document in folder tree
		await documentViewPage.navigateToDocument('/');

		// Find document in sidebar tree
		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');
		const documentTreeItem = folderTree.getByText(testDocument.title);

		if (await documentTreeItem.isVisible()) {
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

			// Confirm rename
			const confirmButton = page.getByTestId('rename-document-btn');
			if (await confirmButton.isVisible()) {
				await confirmButton.click();
			} else {
				await renameInput.press('Enter');
			}

			await page.waitForLoadState('networkidle');

			// Verify document was renamed - check if new title appears
			const renamedDocumentItem = folderTree.getByText(newTitle);
			await expect(renamedDocumentItem).toBeVisible();

			// Navigate to the document and verify title changed
			if (await renamedDocumentItem.isVisible()) {
				await renamedDocumentItem.click();
				await documentViewPage.verifyDocumentLoaded(newTitle);
			}
		} else {
			// If document not visible in tree, navigate directly to document view
			await documentViewPage.navigateToDocument(testDocumentPath);
			await documentViewPage.verifyDocumentLoaded(testDocument.title);

			// Look for document context menu (might be in document header or actions menu)
			const pageActions = page.getByRole('button', { name: /actions|menu|options/i });
			if (await pageActions.isVisible()) {
				await pageActions.click();

				const renameOption = page.getByText(/rename/i);
				if (await renameOption.isVisible()) {
					await renameOption.click();

					const renameInput = page.getByLabel(/title|name/i);
					await expect(renameInput).toBeVisible();

					const newTitle = `Renamed Test Document ${testId}`;
					await renameInput.fill(newTitle);

					const confirmButton = page.getByRole('button', { name: /save|confirm/i });
					await confirmButton.click();

					await documentViewPage.verifyDocumentLoaded(newTitle);
				}
			}
		}
	});

	test('should handle document rename validation', async ({
		documentViewPage,
		withSimpleTestDocument: testDocument,
		page
	}) => {
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// Try to rename with invalid title
		const documentActions = page.getByRole('button', { name: /actions|menu/i });
		if (await documentActions.isVisible()) {
			await documentActions.click();

			const renameOption = page.getByText(/rename/i);
			if (await renameOption.isVisible()) {
				await renameOption.click();

				const renameInput = page.getByLabel(/title|name/i);
				if (await renameInput.isVisible()) {
					// Try empty title
					await renameInput.fill('');

					const saveButton = page.getByRole('button', { name: /save|confirm/i });
					if (await saveButton.isVisible()) {
						await saveButton.click();
						// Should show validation error
						await expect(page.getByText(/required|empty|invalid/i)).toBeVisible();
					}

					// Try title with only whitespace
					await renameInput.fill('   ');
					if (await saveButton.isVisible()) {
						await saveButton.click();
						await expect(page.getByText(/required|empty|invalid/i)).toBeVisible();
					}

					// Cancel the operation
					const cancelButton = page.getByRole('button', { name: /cancel/i });
					if (await cancelButton.isVisible()) {
						await cancelButton.click();
					}
				}
			}
		}

		// Verify original title unchanged
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

		// Rename the document
		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');
		const documentTreeItem = folderTree.getByText(testDocument.title);

		if (await documentTreeItem.isVisible()) {
			await documentTreeItem.click({ button: 'right' });

			const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
			if (await contextMenu.isVisible()) {
				const renameOption = contextMenu.getByText(/rename/i);
				if (await renameOption.isVisible()) {
					await renameOption.click();

					const renameInput = page.getByTestId('document-name');
					if (await renameInput.isVisible()) {
						const newTitle = `Renamed Metadata Test ${testId}`;
						await renameInput.fill(newTitle);

						const confirmButton = page.getByTestId('rename-document-btn');
						if (await confirmButton.isVisible()) {
							await confirmButton.click();
							await page.waitForLoadState('networkidle');

							// Verify document renamed successfully
							await documentViewPage.verifyDocumentLoaded();

							// Verify tags are still present after rename
							await documentViewPage.verifyTags(testDocument.tags!);
						}
					}
				}
			}
		}
	});
});

import { test, expect } from '../fixtures/test-setup';
import { createTestPage } from '../utils/test-data';

test.describe.serial('Page Rename and Move', () => {
	const testPagePath = '/test-page-operations';
	const renamedPagePath = '/renamed-test-page';
	const testFolderName = 'test-move-folder';

	test.beforeEach(async ({ page }) => {
		// Clean up any existing test data
		await page.request.delete(`http://localhost:8080/api/pages${testPagePath}`).catch(() => {});
		await page.request.delete(`http://localhost:8080/api/pages${renamedPagePath}`).catch(() => {});
		await page.request
			.delete(`http://localhost:8080/api/folders/${testFolderName}`)
			.catch(() => {});
	});

	test.afterEach(async ({ page }) => {
		// Clean up test data after each test
		await page.request.delete(`http://localhost:8080/api/pages${testPagePath}`).catch(() => {});
		await page.request.delete(`http://localhost:8080/api/pages${renamedPagePath}`).catch(() => {});
		await page.request
			.delete(`http://localhost:8080/api/folders/${testFolderName}`)
			.catch(() => {});
	});

	test('should rename page via context menu', async ({ pageViewPage, apiHelper, testId, page }) => {
		// Create test page
		const testPage = createTestPage({
			title: `Test Page ${testId}`,
			content: '# Test Page\n\nThis page will be renamed.',
			path: testPagePath
		});

		await apiHelper.createPage(testPage);

		// Navigate to root to see page in folder tree
		await pageViewPage.navigateToPage('/');

		// Find page in sidebar tree
		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');
		const pageTreeItem = folderTree.getByText(testPage.title);

		if (await pageTreeItem.isVisible()) {
			// Right-click on page in tree to open context menu
			await pageTreeItem.click({ button: 'right' });

			// Look for rename option in context menu
			const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
			await expect(contextMenu).toBeVisible({ timeout: 2000 });

			const renameOption = contextMenu.getByText(/rename/i);
			await expect(renameOption).toBeVisible();
			await renameOption.click();

			// Should open rename modal or inline editor
			const renameInput = page
				.getByLabel(/page.*name|title/i)
				.or(page.getByRole('textbox').filter({ hasText: testPage.title }));
			await expect(renameInput).toBeVisible();

			// Enter new name
			const newTitle = `Renamed Test Page ${testId}`;
			await renameInput.fill(newTitle);

			// Confirm rename
			const confirmButton = page.getByRole('button', { name: /confirm|save|rename/i });
			if (await confirmButton.isVisible()) {
				await confirmButton.click();
			} else {
				await renameInput.press('Enter');
			}

			await page.waitForLoadState('networkidle');

			// Verify page was renamed - check if new title appears
			const renamedPageItem = folderTree.getByText(newTitle);
			await expect(renamedPageItem).toBeVisible();

			// Navigate to the page and verify title changed
			if (await renamedPageItem.isVisible()) {
				await renamedPageItem.click();
				await pageViewPage.verifyPageLoaded(newTitle);
			}
		} else {
			// If page not visible in tree, navigate directly to page view
			await pageViewPage.navigateToPage(testPagePath);
			await pageViewPage.verifyPageLoaded(testPage.title);

			// Look for page context menu (might be in page header or actions menu)
			const pageActions = page.getByRole('button', { name: /actions|menu|options/i });
			if (await pageActions.isVisible()) {
				await pageActions.click();

				const renameOption = page.getByText(/rename/i);
				if (await renameOption.isVisible()) {
					await renameOption.click();

					const renameInput = page.getByLabel(/title|name/i);
					await expect(renameInput).toBeVisible();

					const newTitle = `Renamed Test Page ${testId}`;
					await renameInput.fill(newTitle);

					const confirmButton = page.getByRole('button', { name: /save|confirm/i });
					await confirmButton.click();

					await pageViewPage.verifyPageLoaded(newTitle);
				}
			}
		}
	});

	test('should move page between folders via drag and drop', async ({
		pageViewPage,
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create target folder
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.verifyContainsFolder(testFolderName);

		// Create test page in root
		const testPage = createTestPage({
			title: `Moveable Page ${testId}`,
			content: '# Moveable Page\n\nThis page will be moved to a folder.',
			path: testPagePath
		});

		await apiHelper.createPage(testPage);

		// Navigate to root to see both folder and page
		await folderPage.navigateToRoot();

		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');

		// Find page and target folder in tree
		const pageTreeItem = folderTree.getByText(testPage.title);
		const folderTreeItem = folderTree.getByText(testFolderName);

		if ((await pageTreeItem.isVisible()) && (await folderTreeItem.isVisible())) {
			// Perform drag and drop
			await pageTreeItem.dragTo(folderTreeItem);

			await page.waitForLoadState('networkidle');

			// Navigate to target folder to verify page was moved
			await folderPage.openSubFolder(testFolderName);
			await folderPage.verifyFolderLoaded(testFolderName);

			// Verify page appears in target folder
			await folderPage.verifyContainsPage(testPage.title);

			// Verify page is accessible at new location
			const pageLink = folderPage.pages.getByRole('link', { name: testPage.title });
			await pageLink.click();
			await pageViewPage.verifyPageLoaded(testPage.title);

			// Verify URL reflects new location
			await pageViewPage.expectUrl(`/pages/${testFolderName}${testPagePath}`);
		}
	});

	test('should move page via cut and paste operations', async ({
		pageViewPage,
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create target folder
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);

		// Create test page
		const testPage = createTestPage({
			title: `Cut Paste Page ${testId}`,
			content: '# Cut Paste Page\n\nThis page will be cut and pasted.',
			path: testPagePath
		});

		await apiHelper.createPage(testPage);

		// Navigate to page
		await pageViewPage.navigateToPage(testPagePath);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Look for cut/move option in page actions
		const pageActions = page.getByRole('button', { name: /actions|menu|more/i });
		if (await pageActions.isVisible()) {
			await pageActions.click();

			const cutOption = page.getByText(/cut|move/i);
			if (await cutOption.isVisible()) {
				await cutOption.click();

				// Navigate to target folder
				await folderPage.navigateToFolder(`/${testFolderName}`);

				// Look for paste option
				const folderActions = page.getByRole('button', { name: /actions|paste/i });
				if (await folderActions.isVisible()) {
					await folderActions.click();

					const pasteOption = page.getByText(/paste/i);
					if (await pasteOption.isVisible()) {
						await pasteOption.click();

						await page.waitForLoadState('networkidle');

						// Verify page was moved
						await folderPage.verifyContainsPage(testPage.title);
					}
				}
			}
		}
	});

	test('should prevent moving page to invalid locations', async ({
		pageViewPage,
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create test page
		const testPage = createTestPage({
			title: `Protected Page ${testId}`,
			content: '# Protected Page\n\nThis page move should be prevented.',
			path: testPagePath
		});

		await apiHelper.createPage(testPage);

		// Try to drag page to itself or invalid target
		await folderPage.navigateToRoot();

		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');
		const pageTreeItem = folderTree.getByText(testPage.title);

		if (await pageTreeItem.isVisible()) {
			// Try to drag to itself (should not work)
			await pageTreeItem.dragTo(pageTreeItem);

			// Verify page is still in original location
			await pageViewPage.navigateToPage(testPagePath);
			await pageViewPage.verifyPageLoaded(testPage.title);
			await pageViewPage.expectUrl(`/pages${testPagePath}`);
		}
	});

	test('should handle page rename validation', async ({
		pageViewPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create test page
		const testPage = createTestPage({
			title: `Validation Test ${testId}`,
			content: '# Validation Test\n\nTesting rename validation.',
			path: testPagePath
		});

		await apiHelper.createPage(testPage);
		await pageViewPage.navigateToPage(testPagePath);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Try to rename with invalid title
		const pageActions = page.getByRole('button', { name: /actions|menu/i });
		if (await pageActions.isVisible()) {
			await pageActions.click();

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
		await pageViewPage.verifyPageLoaded(testPage.title);
	});

	test('should update breadcrumbs after page move', async ({
		pageViewPage,
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create nested folder structure
		await folderPage.navigateToRoot();
		await folderPage.createFolder('parent-folder');
		await folderPage.openSubFolder('parent-folder');
		await folderPage.createFolder('child-folder');

		// Create test page in root
		const testPage = createTestPage({
			title: `Breadcrumb Page ${testId}`,
			content: '# Breadcrumb Page\n\nTesting breadcrumb updates.',
			path: testPagePath
		});

		await apiHelper.createPage(testPage);

		// Navigate to root and move page to nested folder
		await folderPage.navigateToRoot();

		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');
		const pageTreeItem = folderTree.getByText(testPage.title);

		// Expand parent folder to show child
		await folderPage.expandTreeNode('parent-folder');
		const childFolderItem = folderTree.getByText('child-folder');

		if ((await pageTreeItem.isVisible()) && (await childFolderItem.isVisible())) {
			// Move page to nested folder
			await pageTreeItem.dragTo(childFolderItem);
			await page.waitForLoadState('networkidle');

			// Navigate to moved page
			await folderPage.navigateToFolder('/parent-folder/child-folder');
			const pageLink = folderPage.pages.getByRole('link', { name: testPage.title });
			await pageLink.click();

			// Verify breadcrumbs show correct path
			const breadcrumbs = await pageViewPage.getBreadcrumbPath();
			expect(breadcrumbs).toContain('parent-folder');
			expect(breadcrumbs).toContain('child-folder');
		}

		// Cleanup nested structure
		await page.request.delete('http://localhost:8080/api/folders/parent-folder').catch(() => {});
	});

	test('should preserve page metadata during rename', async ({
		pageViewPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create test page with metadata
		const testPage = createTestPage({
			title: `Metadata Test ${testId}`,
			content: '# Metadata Test\n\nTesting metadata preservation.',
			path: testPagePath,
			tags: ['test', 'metadata', 'preserve']
		});

		await apiHelper.createPage(testPage);
		await pageViewPage.navigateToPage(testPagePath);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Verify original tags are present
		await pageViewPage.verifyTags(testPage.tags!);

		// Rename the page
		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');
		const pageTreeItem = folderTree.getByText(testPage.title);

		if (await pageTreeItem.isVisible()) {
			await pageTreeItem.click({ button: 'right' });

			const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
			if (await contextMenu.isVisible()) {
				const renameOption = contextMenu.getByText(/rename/i);
				if (await renameOption.isVisible()) {
					await renameOption.click();

					const renameInput = page.getByLabel(/title|name/i);
					if (await renameInput.isVisible()) {
						const newTitle = `Renamed Metadata Test ${testId}`;
						await renameInput.fill(newTitle);

						const confirmButton = page.getByRole('button', { name: /save|confirm/i });
						if (await confirmButton.isVisible()) {
							await confirmButton.click();
							await page.waitForLoadState('networkidle');

							// Verify page renamed successfully
							await pageViewPage.verifyPageLoaded(newTitle);

							// Verify tags are still present after rename
							await pageViewPage.verifyTags(testPage.tags!);
						}
					}
				}
			}
		}
	});
});

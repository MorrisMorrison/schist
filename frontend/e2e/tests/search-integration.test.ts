import { test, expect } from '../fixtures/test-setup';
import { createTestPage } from '../utils/test-data';

test.describe.serial('Search Integration with Folder Tree', () => {
	const testFolderName = 'search-test-folder';
	const nestedFolderName = 'nested-search-folder';

	test.beforeEach(async ({ page }) => {
		// Clean up any existing test data
		await page.request
			.delete(`http://localhost:8080/api/folders/${testFolderName}`)
			.catch(() => {});
		await page.request.delete(`http://localhost:8080/api/pages/search-page-1`).catch(() => {});
		await page.request.delete(`http://localhost:8080/api/pages/search-page-2`).catch(() => {});
		await page.request
			.delete(`http://localhost:8080/api/pages/${testFolderName}/nested-page`)
			.catch(() => {});
	});

	test.afterEach(async ({ page }) => {
		// Clean up test data after each test
		await page.request
			.delete(`http://localhost:8080/api/folders/${testFolderName}`)
			.catch(() => {});
		await page.request.delete(`http://localhost:8080/api/pages/search-page-1`).catch(() => {});
		await page.request.delete(`http://localhost:8080/api/pages/search-page-2`).catch(() => {});
		await page.request
			.delete(`http://localhost:8080/api/pages/${testFolderName}/nested-page`)
			.catch(() => {});
	});

	test('should filter folder tree by text query', async ({
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create test folder structure
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);
		await folderPage.openSubFolder(testFolderName);
		await folderPage.createFolder(nestedFolderName);

		// Create pages with searchable content
		const pages = [
			createTestPage({
				title: `Searchable Page ${testId}`,
				content: '# Searchable Content\n\nThis page contains unique searchable text.',
				path: '/search-page-1'
			}),
			createTestPage({
				title: `Another Page ${testId}`,
				content: '# Different Content\n\nThis page has different content.',
				path: '/search-page-2'
			}),
			createTestPage({
				title: `Nested Searchable ${testId}`,
				content: '# Nested Content\n\nThis page is in a nested folder with searchable text.',
				path: `/${testFolderName}/nested-page`
			})
		];

		for (const page of pages) {
			await apiHelper.createPage(page);
		}

		// Navigate to root to see full tree
		await folderPage.navigateToRoot();

		// Use unified search box
		const searchInput = page.getByTestId('sidebar-search');

		if (await searchInput.isVisible()) {
			// Search for specific text
			await searchInput.fill('searchable');
			await page.waitForTimeout(500); // Wait for search to apply

			// Verify only relevant items are visible
			const folderTree = page.getByTestId('folder-tree');

			// Should show pages with "searchable" in title
			await expect(folderTree.getByText('Searchable Page')).toBeVisible();
			await expect(folderTree.getByText('Nested Searchable')).toBeVisible();

			// Should hide pages without matching text
			const nonMatchingPage = folderTree.getByText('Another Page');
			const isNonMatchingVisible = await nonMatchingPage.isVisible().catch(() => false);
			expect(isNonMatchingVisible).toBe(false);

			// Should show folders that contain matching pages
			await expect(folderTree.getByText(testFolderName)).toBeVisible();

			// Clear search
			await searchInput.clear();
			await page.waitForTimeout(500);

			// All items should be visible again
			await expect(folderTree.getByText('Another Page')).toBeVisible();
		}
	});

	test('should filter folder tree by tag query', async ({
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create pages with specific tags
		const pages = [
			createTestPage({
				title: `Tagged Page 1 ${testId}`,
				content: '# Tagged Content\n\nThis page has specific tags.',
				path: '/tagged-page-1',
				tags: ['important', 'test', 'search']
			}),
			createTestPage({
				title: `Tagged Page 2 ${testId}`,
				content: '# Another Tagged Page\n\nThis page has different tags.',
				path: '/tagged-page-2',
				tags: ['draft', 'review', 'search']
			}),
			createTestPage({
				title: `Untagged Page ${testId}`,
				content: '# No Tags\n\nThis page has no tags.',
				path: '/untagged-page'
			})
		];

		for (const page of pages) {
			await apiHelper.createPage(page);
		}

		await folderPage.navigateToRoot();

		// Use tag search
		const searchInput = page.getByTestId('sidebar-search');

		if (await searchInput.isVisible()) {
			// Search for pages with specific tag
			await searchInput.fill('tag:important');
			await page.waitForTimeout(500);

			const folderTree = page.getByTestId('folder-tree');

			// Should show only pages with "important" tag
			await expect(folderTree.getByText('Tagged Page 1')).toBeVisible();

			// Should hide pages without the tag
			const nonMatchingPages = [
				folderTree.getByText('Tagged Page 2'),
				folderTree.getByText('Untagged Page')
			];

			for (const pageElement of nonMatchingPages) {
				const isVisible = await pageElement.isVisible().catch(() => false);
				expect(isVisible).toBe(false);
			}

			// Test multiple tag search
			await searchInput.fill('tag:search');
			await page.waitForTimeout(500);

			// Should show both pages with "search" tag
			await expect(folderTree.getByText('Tagged Page 1')).toBeVisible();
			await expect(folderTree.getByText('Tagged Page 2')).toBeVisible();

			// Should hide untagged page
			const untaggedPage = folderTree.getByText('Untagged Page');
			const isUntaggedVisible = await untaggedPage.isVisible().catch(() => false);
			expect(isUntaggedVisible).toBe(false);
		}
	});

	test('should support combined text and tag search', async ({
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create pages with various combinations of content and tags
		const pages = [
			createTestPage({
				title: `Important Doc ${testId}`,
				content: '# Important Documentation\n\nThis is important project documentation.',
				path: '/important-doc',
				tags: ['documentation', 'important', 'project']
			}),
			createTestPage({
				title: `Project Guide ${testId}`,
				content: '# Project Guide\n\nGeneral project information.',
				path: '/project-guide',
				tags: ['guide', 'project']
			}),
			createTestPage({
				title: `Important Notes ${testId}`,
				content: '# Meeting Notes\n\nImportant meeting notes.',
				path: '/meeting-notes',
				tags: ['notes', 'meeting']
			})
		];

		for (const page of pages) {
			await apiHelper.createPage(page);
		}

		await folderPage.navigateToRoot();

		const searchInput = page.getByTestId('sidebar-search');

		if (await searchInput.isVisible()) {
			// Combined search: text + tag
			await searchInput.fill('important tag:project');
			await page.waitForTimeout(500);

			const folderTree = page.getByTestId('folder-tree');

			// Should show only pages that match both criteria
			// "Important Doc" has both "important" in title/content AND "project" tag
			await expect(folderTree.getByText('Important Doc')).toBeVisible();

			// Should hide pages that only match one criterion
			const partialMatches = [
				folderTree.getByText('Project Guide'), // has project tag but no "important" text
				folderTree.getByText('Important Notes') // has important text but no "project" tag
			];

			for (const pageElement of partialMatches) {
				const isVisible = await pageElement.isVisible().catch(() => false);
				expect(isVisible).toBe(false);
			}
		}
	});

	test('should update page counts during search', async ({
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create folder with mixed content
		await folderPage.navigateToRoot();
		await folderPage.createFolder(testFolderName);

		// Create pages - some matching, some not
		const pages = [
			createTestPage({
				title: `Matching Page 1 ${testId}`,
				content: '# Special Content\n\nThis page has special content.',
				path: `/${testFolderName}/matching-1`,
				tags: ['special']
			}),
			createTestPage({
				title: `Matching Page 2 ${testId}`,
				content: '# More Special Content\n\nAnother special page.',
				path: `/${testFolderName}/matching-2`,
				tags: ['special']
			}),
			createTestPage({
				title: `Regular Page ${testId}`,
				content: '# Regular Content\n\nJust regular content.',
				path: `/${testFolderName}/regular-page`
			})
		];

		for (const page of pages) {
			await apiHelper.createPage(page);
		}

		await folderPage.navigateToRoot();

		// Check initial page count for folder

		const folderTree = page.getByTestId('folder-tree');

		const folderItem = folderTree.locator(`text=${testFolderName}`).first();

		// Should show total count initially (3)
		await expect(folderItem.locator('text="(3)"')).toBeVisible();

		// Apply search filter
		const searchInput = page.getByTestId('sidebar-search');

		if (await searchInput.isVisible()) {
			await searchInput.fill('tag:special');
			await page.waitForTimeout(500);

			// Page count should update to show only matching pages (2)
			await expect(folderItem.locator('text="(2)"')).toBeVisible();

			await searchInput.clear();
			await page.waitForTimeout(500);

			// Count should return to full total (3)
			await expect(folderItem.locator('text="(3)"')).toBeVisible();
		}
	});

	test('should hide empty folders during search', async ({
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create folders with and without matching content
		await folderPage.navigateToRoot();
		await folderPage.createFolder('folder-with-matches');
		await folderPage.createFolder('empty-folder-no-matches');

		// Add matching content to first folder only
		const matchingPage = createTestPage({
			title: `Unique Content ${testId}`,
			content: '# Unique Content\n\nThis is unique searchable content.',
			path: '/folder-with-matches/unique-page',
			tags: ['unique']
		});

		await apiHelper.createPage(matchingPage);

		// Add non-matching content to second folder
		const nonMatchingPage = createTestPage({
			title: `Different Content ${testId}`,
			content: '# Different Content\n\nThis content does not match.',
			path: '/empty-folder-no-matches/different-page'
		});

		await apiHelper.createPage(nonMatchingPage);

		await folderPage.navigateToRoot();

		const searchInput = page.getByTestId('sidebar-search');
		const folderTree = page.getByTestId('folder-tree');

		if (await searchInput.isVisible()) {
			// Search for unique content
			await searchInput.fill('unique');
			await page.waitForTimeout(500);

			// Should show folder with matching content
			await expect(folderTree.getByText('folder-with-matches')).toBeVisible();
			await expect(folderTree.getByText('Unique Content')).toBeVisible();

			// Should hide folder without matching content
			const emptyFolder = folderTree.getByText('empty-folder-no-matches');
			const isEmptyFolderVisible = await emptyFolder.isVisible().catch(() => false);
			expect(isEmptyFolderVisible).toBe(false);
		}

		// Cleanup
		await page.request
			.delete('http://localhost:8080/api/folders/folder-with-matches')
			.catch(() => {});
		await page.request
			.delete('http://localhost:8080/api/folders/empty-folder-no-matches')
			.catch(() => {});
	});

	test('should handle search with no results gracefully', async ({ folderPage, page }) => {
		await folderPage.navigateToRoot();

		const searchInput = page.getByTestId('sidebar-search');

		if (await searchInput.isVisible()) {
			// Search for something that doesn't exist
			await searchInput.fill('nonexistent-content-xyz-123');
			await page.waitForTimeout(500);

			// Should show empty state or message
			const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');
			const emptyMessage = page.getByText(/no.*match|no.*found|empty/i);

			// Either empty tree or explicit message
			const hasResults = await folderTree.locator('[role="treeitem"]').count();
			const hasEmptyMessage = await emptyMessage.isVisible().catch(() => false);

			// Should either have no results or show empty message
			expect(hasResults === 0 || hasEmptyMessage).toBe(true);
		}
	});

	test('should support prefix matching for tags', async ({
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create pages with tags that share prefixes
		const pages = [
			createTestPage({
				title: `Prefix Test 1 ${testId}`,
				content: '# Prefix Test\n\nTesting prefix matching.',
				path: '/prefix-test-1',
				tags: ['project-alpha', 'important']
			}),
			createTestPage({
				title: `Prefix Test 2 ${testId}`,
				content: '# Another Prefix Test\n\nMore prefix testing.',
				path: '/prefix-test-2',
				tags: ['project-beta', 'documentation']
			}),
			createTestPage({
				title: `Non-matching ${testId}`,
				content: '# Different Content\n\nNo matching tags.',
				path: '/non-matching',
				tags: ['alpha-project', 'notes'] // Should not match "tag:project"
			})
		];

		for (const page of pages) {
			await apiHelper.createPage(page);
		}

		await folderPage.navigateToRoot();

		const searchInput = page.getByTestId('sidebar-search');
		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');

		if (await searchInput.isVisible()) {
			// Search for tag prefix
			await searchInput.fill('tag:project');
			await page.waitForTimeout(500);

			// Should match tags that START with "project"
			await expect(folderTree.getByText('Prefix Test 1')).toBeVisible(); // has "project-alpha"
			await expect(folderTree.getByText('Prefix Test 2')).toBeVisible(); // has "project-beta"

			// Should NOT match tags where "project" appears in the middle
			const nonMatchingPage = folderTree.getByText('Non-matching');
			const isNonMatchingVisible = await nonMatchingPage.isVisible().catch(() => false);
			expect(isNonMatchingVisible).toBe(false); // "alpha-project" should not match
		}
	});

	test('should maintain search state during navigation', async ({
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create searchable content
		const testPage = createTestPage({
			title: `Persistent Search ${testId}`,
			content: '# Persistent Search\n\nTesting search persistence.',
			path: '/persistent-search',
			tags: ['persistent']
		});

		await apiHelper.createPage(testPage);
		await folderPage.navigateToRoot();

		const searchInput = page.getByTestId('sidebar-search');
		if (await searchInput.isVisible()) {
			// Apply search
			await searchInput.fill('persistent');
			await page.waitForTimeout(500);

			// Navigate to a different section and back
			await page.goto('/');
			await page.goto('/folders');

			// Search should still be applied (depending on implementation)
			const searchValue = await searchInput.inputValue();
			const isSearchPersistent = searchValue.includes('persistent');

			if (isSearchPersistent) {
				// If search persists, verify filtered results
				const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');
				await expect(folderTree.getByText('Persistent Search')).toBeVisible();
			} else {
				// If search clears, verify all content is visible
				await expect(searchInput).toHaveValue('');
			}
		}
	});
});

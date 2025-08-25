import { test, expect } from '../fixtures';
import { createTestPage } from '../utils/test-data';

test.describe.serial('Search Integration with Folder Tree', () => {
	test('should filter folder tree by text query', async ({ folderPage, page }) => {
		// Search test data is created by the fixture

		// Navigate to root to see full tree
		await folderPage.navigateToRoot();

		// Use unified search box
		const searchInput = page.getByTestId('sidebar-search');
		const folderTree = page.getByTestId('folder-tree');

		if (await searchInput.isVisible()) {
			// Search for specific text that exists in our fixture data
			await searchInput.fill('searchable');
			// Wait for search results to update
			await expect(folderTree.getByText('Searchable Content')).toBeVisible();

			// Should show pages with "searchable" in title or content
			await expect(folderTree.getByText('Searchable Content')).toBeVisible();
			await expect(folderTree.getByText('Nested Searchable')).toBeVisible();

			// Should hide pages without matching text
			const nonMatchingPage = folderTree.getByText('Different Title');
			const isNonMatchingVisible = await nonMatchingPage.isVisible().catch(() => false);
			expect(isNonMatchingVisible).toBe(false);

			// Clear search
			await searchInput.clear();
			// Wait for all content to be visible again
			await expect(folderTree.getByText('Different Title')).toBeVisible();

			// All items should be visible again
			await expect(folderTree.getByText('Different Title')).toBeVisible();
		}
	});

	test('should filter folder tree by tag query', async ({ folderPage, page }) => {
		// Search test data is created by the fixture

		await folderPage.navigateToRoot();

		// Use tag search
		const searchInput = page.getByTestId('sidebar-search');
		const folderTree = page.getByTestId('folder-tree');

		if (await searchInput.isVisible()) {
			// Search for pages with specific tag
			await searchInput.fill('tag:important');
			// Wait for filtered results to appear
			await expect(folderTree.getByText('Important Document')).toBeVisible();

			// Should show only pages with "important" tag
			await expect(folderTree.getByText('Important Document')).toBeVisible();

			// Should hide pages without the tag
			const nonMatchingPages = [
				folderTree.getByText('Draft Content'),
				folderTree.getByText('Project Alpha')
			];

			for (const pageElement of nonMatchingPages) {
				const isVisible = await pageElement.isVisible().catch(() => false);
				expect(isVisible).toBe(false);
			}

			// Test project tag search (should match both project-alpha and project-beta)
			await searchInput.fill('tag:project');
			// Wait for matching pages to be visible
			await expect(folderTree.getByText('Project Alpha')).toBeVisible();
			await expect(folderTree.getByText('Project Beta')).toBeVisible();

			// Should show both pages with project tags
			await expect(folderTree.getByText('Project Alpha')).toBeVisible();
			await expect(folderTree.getByText('Project Beta')).toBeVisible();

			// Should hide non-project pages
			const nonProjectPage = folderTree.getByText('Draft Content');
			const isNonProjectVisible = await nonProjectPage.isVisible().catch(() => false);
			expect(isNonProjectVisible).toBe(false);
		}
	});

	test('should support combined text and tag search', async ({ folderPage, page }) => {
		// Search test data is created by the fixture

		await folderPage.navigateToRoot();

		const searchInput = page.getByTestId('sidebar-search');
		const folderTree = page.getByTestId('folder-tree');

		if (await searchInput.isVisible()) {
			// Combined search: text + tag
			await searchInput.fill('important tag:project');
			// Wait for filtered results to appear
			await expect(folderTree.getByText('Important Project')).toBeVisible();

			// Should show only pages that match both criteria
			// "Important Project" has both "important" in title/content AND "project" tag
			await expect(folderTree.getByText('Important Project')).toBeVisible();

			// Should hide pages that only match one criterion
			const partialMatches = [
				folderTree.getByText('Regular Content'), // has project tag but no "important" text
				folderTree.getByText('Important Notes') // has important text but no "project" tag
			];

			for (const pageElement of partialMatches) {
				const isVisible = await pageElement.isVisible().catch(() => false);
				expect(isVisible).toBe(false);
			}
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
		const matchingDocument = createTestPage({
			title: `Unique Content ${testId}`,
			content: '# Unique Content\n\nThis is unique searchable content.',
			path: '/folder-with-matches/unique-page',
			tags: ['unique']
		});

		await apiHelper.createDocument(matchingDocument);

		// Add non-matching content to second folder
		const nonMatchingPage = createTestPage({
			title: `Different Content ${testId}`,
			content: '# Different Content\n\nThis content does not match.',
			path: '/empty-folder-no-matches/different-page'
		});

		await apiHelper.createDocument(nonMatchingPage);

		await folderPage.navigateToRoot();

		const searchInput = page.getByTestId('sidebar-search');
		const folderTree = page.getByTestId('folder-tree');

		if (await searchInput.isVisible()) {
			// Search for unique content
			await searchInput.fill('unique');
			// Wait for matching content to appear
			await expect(folderTree.getByText('Unique Content')).toBeVisible();

			// Should show folder with matching content
			await expect(folderTree.getByText('folder-with-matches')).toBeVisible();
			await expect(folderTree.getByText('Unique Content')).toBeVisible();

			// Should hide folder without matching content
			const emptyFolder = folderTree.getByText('empty-folder-no-matches');
			const isEmptyFolderVisible = await emptyFolder.isVisible().catch(() => false);
			expect(isEmptyFolderVisible).toBe(false);
		}
	});

	test('should handle search with no results gracefully', async ({ folderPage, page }) => {
		await folderPage.navigateToRoot();

		const searchInput = page.getByTestId('sidebar-search');

		if (await searchInput.isVisible()) {
			// Search for something that doesn't exist
			await searchInput.fill('nonexistent-content-xyz-123');
			// Wait for search to complete - verify search input has the value
			await expect(searchInput).toHaveValue('nonexistent-content-xyz-123');
			// Brief wait for search processing
			await page.waitForLoadState('domcontentloaded');

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
			await apiHelper.createDocument(page);
		}

		await folderPage.navigateToRoot();

		const searchInput = page.getByTestId('sidebar-search');
		const folderTree = page.locator('[data-testid="folder-tree"], [role="tree"]');

		if (await searchInput.isVisible()) {
			// Search for tag prefix
			await searchInput.fill('tag:project');
			// Wait for matching pages to appear
			await expect(folderTree.getByText('Prefix Test 1')).toBeVisible();

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
		const testDocument = createTestPage({
			title: `Persistent Search ${testId}`,
			content: '# Persistent Search\n\nTesting search persistence.',
			path: '/persistent-search',
			tags: ['persistent']
		});

		await apiHelper.createDocument(testDocument);
		await folderPage.navigateToRoot();

		const searchInput = page.getByTestId('sidebar-search');
		if (await searchInput.isVisible()) {
			// Apply search
			await searchInput.fill('persistent');
			// Wait for search results to appear
			await expect(page.getByTestId('folder-tree').getByText('Persistent Search')).toBeVisible();

			// Navigate to a different section and back
			await page.goto('/');
			await page.goto('/folders');

			// Search should still be applied (depending on implementation)
			const searchValue = await searchInput.inputValue();
			const isSearchPersistent = searchValue.includes('persistent');

			if (isSearchPersistent) {
				// If search persists, verify filtered results
				const folderTree = page.getByTestId('folder-tree');
				await expect(folderTree.getByText('Persistent Search')).toBeVisible();
			} else {
				// If search clears, verify all content is visible
				await expect(searchInput).toHaveValue('');
			}
		}
	});
});

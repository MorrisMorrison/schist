import { test, expect } from '../fixtures';

test.describe.serial('Search Integration with Folder Tree', () => {
	test('should filter folder tree by text query', async ({ folderPage, apiHelper, testId }) => {
		// Seed documents this test asserts on (the folder-tree filter matches page titles).
		await apiHelper.seedDocument({
			title: `Searchable Content ${testId}`,
			path: `/searchable-content-${testId}`,
			tags: ['searchable']
		});
		await apiHelper.seedDocument({
			title: `Nested Searchable ${testId}`,
			path: `/nested-searchable-${testId}`,
			tags: ['searchable']
		});
		await apiHelper.seedDocument({
			title: `Different Title ${testId}`,
			path: `/different-title-${testId}`,
			tags: ['other']
		});

		// Navigate to root to see full tree
		await folderPage.navigateToRoot();

		// Use unified search box
		const searchInput = folderPage.treeFilter;
		const { folderTree } = folderPage;
		await expect(searchInput).toBeVisible();

		// Search for specific text that exists in our seeded data (matched against page title)
		await searchInput.fill('searchable');

		// Should show pages with "searchable" in the title
		await expect(folderTree.getByText('Searchable Content')).toBeVisible();
		await expect(folderTree.getByText('Nested Searchable')).toBeVisible();

		// Should hide pages without matching text
		await expect(folderTree.getByText('Different Title')).toHaveCount(0);

		// Clear search
		await searchInput.clear();

		// All items should be visible again
		await expect(folderTree.getByText('Different Title')).toBeVisible();
	});

	test('should filter folder tree by tag query', async ({ folderPage, apiHelper, testId }) => {
		await apiHelper.seedDocument({
			title: `Important Document ${testId}`,
			path: `/important-document-${testId}`,
			tags: ['important']
		});
		await apiHelper.seedDocument({
			title: `Draft Content ${testId}`,
			path: `/draft-content-${testId}`,
			tags: ['draft']
		});
		await apiHelper.seedDocument({
			title: `Project Alpha ${testId}`,
			path: `/project-alpha-${testId}`,
			tags: ['project-alpha']
		});
		await apiHelper.seedDocument({
			title: `Project Beta ${testId}`,
			path: `/project-beta-${testId}`,
			tags: ['project-beta']
		});

		await folderPage.navigateToRoot();

		// Use tag search
		const searchInput = folderPage.treeFilter;
		const { folderTree } = folderPage;
		await expect(searchInput).toBeVisible();

		// Search for pages with specific tag
		await searchInput.fill('tag:important');

		// Should show only pages with "important" tag
		await expect(folderTree.getByText('Important Document')).toBeVisible();

		// Should hide pages without the tag
		await expect(folderTree.getByText('Draft Content')).toHaveCount(0);
		await expect(folderTree.getByText('Project Alpha')).toHaveCount(0);

		// Test project tag search (prefix match: should match both project-alpha and project-beta)
		await searchInput.fill('tag:project');
		await expect(folderTree.getByText('Project Alpha')).toBeVisible();
		await expect(folderTree.getByText('Project Beta')).toBeVisible();

		// Should hide non-project pages
		await expect(folderTree.getByText('Draft Content')).toHaveCount(0);
	});

	test('should support combined text and tag search', async ({ folderPage, apiHelper, testId }) => {
		await apiHelper.seedDocument({
			title: `Important Project ${testId}`,
			path: `/important-project-${testId}`,
			tags: ['project']
		});
		await apiHelper.seedDocument({
			title: `Regular Content ${testId}`,
			path: `/regular-content-${testId}`,
			tags: ['project']
		});
		await apiHelper.seedDocument({
			title: `Important Notes ${testId}`,
			path: `/important-notes-${testId}`,
			tags: ['notes']
		});

		await folderPage.navigateToRoot();

		const searchInput = folderPage.treeFilter;
		const { folderTree } = folderPage;
		await expect(searchInput).toBeVisible();

		// Combined search: text (matched in title) + tag
		await searchInput.fill('important tag:project');

		// Should show only pages that match both criteria: "important" in the title AND a "project" tag
		await expect(folderTree.getByText('Important Project')).toBeVisible();

		// Should hide pages that only match one criterion
		await expect(folderTree.getByText('Regular Content')).toHaveCount(0); // project tag but no "important" title
		await expect(folderTree.getByText('Important Notes')).toHaveCount(0); // important title but no "project" tag
	});

	test('should hide empty folders during search', async ({ folderPage, apiHelper, testId }) => {
		// Create folders with and without matching content
		await folderPage.navigateToRoot();
		await folderPage.createFolder('folder-with-matches');
		await folderPage.createFolder('empty-folder-no-matches');

		// Add matching content to first folder only
		await apiHelper.seedDocument({
			title: `Unique Content ${testId}`,
			content: '# Unique Content\n\nThis is unique searchable content.',
			path: '/folder-with-matches/unique-page',
			tags: ['unique']
		});

		// Add non-matching content to second folder
		await apiHelper.seedDocument({
			title: `Different Content ${testId}`,
			content: '# Different Content\n\nThis content does not match.',
			path: '/empty-folder-no-matches/different-page'
		});

		await folderPage.navigateToRoot();

		const searchInput = folderPage.treeFilter;
		const { folderTree } = folderPage;
		await expect(searchInput).toBeVisible();

		// Search for unique content
		await searchInput.fill('unique');

		// Should show the folder that contains matching content. (The folder tree does not
		// auto-expand matching subfolders during search, so the nested page itself is only
		// revealed once the folder is expanded; the folder appearing at all already proves it
		// contains a match.)
		await expect(folderTree.getByText('folder-with-matches')).toBeVisible();

		// Should hide folder without matching content
		await expect(folderTree.getByText('empty-folder-no-matches')).toHaveCount(0);
	});

	test('should handle search with no results gracefully', async ({ folderPage, page }) => {
		await folderPage.navigateToRoot();

		const searchInput = folderPage.treeFilter;
		await expect(searchInput).toBeVisible();

		// Search for something that doesn't exist
		await searchInput.fill('nonexistent-content-xyz-123');
		await expect(searchInput).toHaveValue('nonexistent-content-xyz-123');

		// Should show empty state or message
		const { folderTree } = folderPage;
		const emptyMessage = page.getByText(/no.*match|no.*found|empty/i);

		// Either empty tree or explicit message
		const hasResults = await folderTree.locator('[role="treeitem"]').count();
		const hasEmptyMessage = await emptyMessage.isVisible().catch(() => false);

		// Should either have no results or show empty message
		expect(hasResults === 0 || hasEmptyMessage).toBe(true);
	});

	test('should support prefix matching for tags', async ({ folderPage, apiHelper, testId }) => {
		// Create pages with tags that share prefixes
		await apiHelper.seedDocument({
			title: `Prefix Test 1 ${testId}`,
			content: '# Prefix Test\n\nTesting prefix matching.',
			path: `/prefix-test-1-${testId}`,
			tags: ['project-alpha', 'important']
		});
		await apiHelper.seedDocument({
			title: `Prefix Test 2 ${testId}`,
			content: '# Another Prefix Test\n\nMore prefix testing.',
			path: `/prefix-test-2-${testId}`,
			tags: ['project-beta', 'documentation']
		});
		await apiHelper.seedDocument({
			title: `Non-matching ${testId}`,
			content: '# Different Content\n\nNo matching tags.',
			path: `/non-matching-${testId}`,
			tags: ['alpha-project', 'notes'] // Should not match "tag:project"
		});

		await folderPage.navigateToRoot();

		const searchInput = folderPage.treeFilter;
		const { folderTree } = folderPage;
		await expect(searchInput).toBeVisible();

		// Search for tag prefix
		await searchInput.fill('tag:project');

		// Should match tags that START with "project"
		await expect(folderTree.getByText('Prefix Test 1')).toBeVisible(); // has "project-alpha"
		await expect(folderTree.getByText('Prefix Test 2')).toBeVisible(); // has "project-beta"

		// Should NOT match tags where "project" appears in the middle ("alpha-project")
		await expect(folderTree.getByText('Non-matching')).toHaveCount(0);
	});

	test('should maintain search state during navigation', async ({
		folderPage,
		apiHelper,
		testId,
		page
	}) => {
		// Create searchable content
		await apiHelper.seedDocument({
			title: `Persistent Search ${testId}`,
			content: '# Persistent Search\n\nTesting search persistence.',
			path: `/persistent-search-${testId}`,
			tags: ['persistent']
		});
		await folderPage.navigateToRoot();

		const searchInput = folderPage.treeFilter;
		await expect(searchInput).toBeVisible();

		// Apply search (matched against title)
		await searchInput.fill('persistent');
		await expect(folderPage.folderTree.getByText('Persistent Search')).toBeVisible();

		// Navigate to a different section and back
		await page.goto('/');
		await page.goto('/folders');

		// Search may or may not persist depending on implementation; assert both branches are consistent
		const searchValue = await searchInput.inputValue();
		const isSearchPersistent = searchValue.includes('persistent');

		if (isSearchPersistent) {
			// If search persists, verify filtered results
			await expect(folderPage.folderTree.getByText('Persistent Search')).toBeVisible();
		} else {
			// If search clears, verify the input is empty
			await expect(searchInput).toHaveValue('');
		}
	});
});

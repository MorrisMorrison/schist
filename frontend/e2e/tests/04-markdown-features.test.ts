import { test, expect } from '@playwright/test';

test.describe('Markdown Features', () => {
	test('sidebar plus button creates new document', async ({ page }) => {
		await page.goto('/');

		// Find and click the plus button in the sidebar
		const plusButton = page.locator('[title="Create new document"]');
		await expect(plusButton).toBeVisible();

		await plusButton.click();

		// Should navigate to /new
		await expect(page).toHaveURL(/\/new$/);

		// Should show the editor
		await expect(page.locator('.cm-editor')).toBeVisible();
	});

	test('wiki links work in preview', async ({ page }) => {
		// Navigate to editor
		await page.goto('/new');

		// Add wiki link content
		const wikiLinkContent = '# Test Wiki Links\n\n[[Test Document]]';
		await page.fill('.cm-content', wikiLinkContent);

		// Check preview shows wiki link
		const preview = page.locator('[data-testid="markdown-preview"]');
		await expect(preview.locator('.wiki-link')).toBeVisible();

		// Wiki link should be red (broken link) initially
		const wikiLink = preview.locator('.wiki-link');
		await expect(wikiLink).toHaveClass(/broken-link/);
		await expect(wikiLink).toHaveClass(/text-red-500/);

		// Broken links should not be clickable
		await expect(wikiLink).toHaveClass(/cursor-default/);
	});

	test('image rendering works in preview', async ({ page }) => {
		// Navigate to editor
		await page.goto('/new');

		// Add image content with proper syntax
		const imageContent =
			'# Test Images\n\n![Test Image](https://via.placeholder.com/300x200 "Test Image|medium")';
		await page.fill('.cm-content', imageContent);

		// Check preview shows image element
		const preview = page.locator('[data-testid="markdown-preview"]');
		const image = preview.locator('img[alt="Test Image"]');

		// Wait for the image element to be present in DOM
		await expect(image).toBeAttached();

		// Check the image has correct attributes (don't wait for loading)
		await expect(image).toHaveAttribute('src', 'https://via.placeholder.com/300x200');
		await expect(image).toHaveAttribute('title', 'Test Image');

		// Image should have correct size class
		await expect(image).toHaveClass(/max-w-md/);

		// Image should be clickable
		await expect(image).toHaveClass(/cursor-pointer/);
	});

	test('malformed image syntax still renders image', async ({ page }) => {
		// Navigate to editor
		await page.goto('/new');

		// Add malformed image content (like in the bug report)
		const malformedContent =
			'# Test\n\n![test.png](https://via.placeholder.com/200x150) !="malformed|large"]';
		await page.fill('.cm-content', malformedContent);

		// Even malformed syntax should show an image
		const preview = page.locator('[data-testid="markdown-preview"]');
		const image = preview.locator('img[alt="test.png"]');

		// Wait for the image element to be present in DOM
		await expect(image).toBeAttached();

		// Check the image has correct attributes (don't wait for loading)
		await expect(image).toHaveAttribute('src', 'https://via.placeholder.com/200x150');
	});

	test('task lists render as checkboxes in preview', async ({ page }) => {
		// Navigate to editor
		await page.goto('/new');

		// Add task list content with both checked and unchecked items
		const taskListContent =
			'# Task List Test\n\n' +
			'## My Tasks\n\n' +
			'- [x] Completed task\n' +
			'- [ ] Uncompleted task\n' +
			'- [X] Another completed task (uppercase)\n' +
			'- Regular list item\n\n' +
			'More tasks:\n' +
			'- [ ] Task with **bold** text\n' +
			'- [x] Task with *italic* text';

		await page.fill('.cm-content', taskListContent);

		// Check preview renders checkboxes correctly
		const preview = page.locator('[data-testid="markdown-preview"]');
		
		// Wait for preview to update (there's a 300ms delay in the editor)
		await page.waitForTimeout(500);

		// Wait for checkboxes to appear
		const checkboxes = preview.locator('[data-testid="checkbox"]');
		await expect(checkboxes).toHaveCount(5); // 5 checkbox items total

		// Check that checked checkboxes have the checked state
		const checkedBoxes = preview.locator('[data-testid="checkbox"][data-state="checked"]');
		await expect(checkedBoxes).toHaveCount(3); // 3 checked items (x, X, x)

		// Check that unchecked checkboxes have the unchecked state
		const uncheckedBoxes = preview.locator('[data-testid="checkbox"][data-state="unchecked"]');
		await expect(uncheckedBoxes).toHaveCount(2); // 2 unchecked items

		// Verify checkboxes are disabled (read-only in preview)
		const disabledBoxes = preview.locator('[data-testid="checkbox"][disabled]');
		await expect(disabledBoxes).toHaveCount(5); // All checkboxes should be disabled

		// Verify that regular list items don't have checkboxes
		const listItems = preview.locator('ul li');
		const regularListItem = listItems.filter({ hasText: 'Regular list item' });
		const regularItemCheckbox = regularListItem.locator('[data-testid="checkbox"]');
		await expect(regularItemCheckbox).toHaveCount(0); // Regular item has no checkbox

		// Verify that task list items don't show bullet points
		// (This tests our CSS styling that removes list-style-type)
		const taskListItems = preview.locator('[data-testid="task-item"]');
		await expect(taskListItems.first()).toHaveCSS('list-style-type', 'none');
	});
});

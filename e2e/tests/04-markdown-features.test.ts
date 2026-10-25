import { test, expect, type EditorPage } from '../fixtures';

/**
 * Open a new document, fill the editor with `content` in one go (not
 * keystroke by keystroke like EditorPage.setContent) and switch to the
 * preview. Returns the preview pane.
 */
async function previewNewDocument(editorPage: EditorPage, content: string) {
	await editorPage.navigateToNew();
	await editorPage.contentEditor.fill(content);
	return editorPage.showPreview();
}

test.describe('Markdown Features', () => {
	test('sidebar plus menu creates new document', async ({ page, editorPage }) => {
		await page.goto('/');

		// The sidebar's "+" opens a menu; "New page" starts a document.
		const plusButton = page.getByTestId('sidebar-new-menu');
		await expect(plusButton).toBeVisible();

		await plusButton.click();
		await page.getByRole('menuitem', { name: 'New page' }).click();

		// Should navigate to /new
		await expect(page).toHaveURL(/\/new$/);

		// Should show the editor
		await expect(editorPage.contentEditor).toBeVisible();
	});

	test('wiki links work in preview', async ({ editorPage }) => {
		// Check preview shows wiki link
		const preview = await previewNewDocument(editorPage, '# Test Wiki Links\n\n[[Test Document]]');
		await expect(preview.locator('.wiki-link')).toBeVisible();

		// Wiki link should be red (broken link) initially
		const wikiLink = preview.locator('.wiki-link');
		await expect(wikiLink).toHaveClass(/broken-link/);
		await expect(wikiLink).toHaveClass(/text-red-500/);

		// Broken links should not be clickable
		await expect(wikiLink).toHaveClass(/cursor-default/);
	});

	test('image rendering works in preview', async ({ editorPage }) => {
		// Image content with proper syntax; the preview shows an image element
		const preview = await previewNewDocument(
			editorPage,
			'# Test Images\n\n![Test Image](https://via.placeholder.com/300x200 "Test Image|medium")'
		);
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

	test('malformed image syntax still renders image', async ({ editorPage }) => {
		// Malformed image content (like in the bug report) should still show an image
		const preview = await previewNewDocument(
			editorPage,
			'# Test\n\n![test.png](https://via.placeholder.com/200x150) !="malformed|large"]'
		);
		const image = preview.locator('img[alt="test.png"]');

		// Wait for the image element to be present in DOM
		await expect(image).toBeAttached();

		// Check the image has correct attributes (don't wait for loading)
		await expect(image).toHaveAttribute('src', 'https://via.placeholder.com/200x150');
	});

	test('task lists render as checkboxes in preview', async ({ editorPage }) => {
		// Task list content with both checked and unchecked items
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

		// Check preview renders checkboxes correctly
		const preview = await previewNewDocument(editorPage, taskListContent);

		// The preview updates after a short debounce; toHaveCount waits for it.
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

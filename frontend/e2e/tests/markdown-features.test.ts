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
});

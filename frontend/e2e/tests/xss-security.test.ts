import { test, expect } from '@playwright/test';

test.describe('XSS Security Protection', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should sanitize script tags in markdown content', async ({ page }) => {
		const maliciousContent = `# Test Document

This is a test with malicious content:

<script>alert('XSS Attack!');</script>

Some normal content here.`;

		await page.locator('[data-testid="create-document"]').click();

		await page.locator('[data-testid="document-title-input"]').fill('XSS Test Document');
		await page.locator('[data-testid="document-content-textarea"]').fill(maliciousContent);

		await page.locator('[data-testid="save-document"]').click();

		await expect(page.locator('[data-testid="document-view"]')).toBeVisible();

		const content = await page.locator('[data-testid="document-content"]').innerHTML();
		expect(content).not.toContain('<script>');
		expect(content).not.toContain('alert(');
		expect(content).toContain('Some normal content here');
	});

	test('should sanitize dangerous onclick handlers in images', async ({ page }) => {
		const maliciousContent = `# Image XSS Test

![Alt text](/assets/test.jpg "Title|small" onclick="alert('XSS via image!')")

Normal content after image.`;

		await page.locator('[data-testid="create-document"]').click();

		await page.locator('[data-testid="document-title-input"]').fill('Image XSS Test');
		await page.locator('[data-testid="document-content-textarea"]').fill(maliciousContent);

		await page.locator('[data-testid="save-document"]').click();

		await expect(page.locator('[data-testid="document-view"]')).toBeVisible();

		const content = await page.locator('[data-testid="document-content"]').innerHTML();
		expect(content).not.toContain('onclick=');
		expect(content).not.toContain('alert(');
		expect(content).toContain('img');
		expect(content).toContain('Alt text');
	});

	test('should sanitize dangerous HTML attributes', async ({ page }) => {
		const maliciousContent = `# Attribute XSS Test

<div onload="alert('XSS')" onmouseover="alert('Hover XSS')" onclick="alert('Click XSS')">
	This div has dangerous attributes
</div>

<img src="x" onerror="alert('Image error XSS')" />

<a href="javascript:alert('Link XSS')">Dangerous link</a>`;

		await page.locator('[data-testid="create-document"]').click();

		await page.locator('[data-testid="document-title-input"]').fill('Attribute XSS Test');
		await page.locator('[data-testid="document-content-textarea"]').fill(maliciousContent);

		await page.locator('[data-testid="save-document"]').click();

		await expect(page.locator('[data-testid="document-view"]')).toBeVisible();

		const content = await page.locator('[data-testid="document-content"]').innerHTML();
		expect(content).not.toContain('onload=');
		expect(content).not.toContain('onmouseover=');
		expect(content).not.toContain('onclick=');
		expect(content).not.toContain('onerror=');
		expect(content).not.toContain('javascript:');
		expect(content).toContain('This div has dangerous attributes');
	});

	test('should preserve safe markdown features', async ({ page }) => {
		const safeContent = `# Safe Markdown Test

## Subheading

**Bold text** and *italic text*

- List item 1
- List item 2

\`\`\`javascript
function safeCode() {
  console.log("This is safe code");
}
\`\`\`

[Safe link](https://example.com)

![Safe image](/assets/safe-image.jpg)

> Blockquote content

| Table | Header |
|-------|--------|
| Cell 1| Cell 2 |

---

Final paragraph.`;

		await page.locator('[data-testid="create-document"]').click();

		await page.locator('[data-testid="document-title-input"]').fill('Safe Markdown Test');
		await page.locator('[data-testid="document-content-textarea"]').fill(safeContent);

		await page.locator('[data-testid="save-document"]').click();

		await expect(page.locator('[data-testid="document-view"]')).toBeVisible();

		const content = await page.locator('[data-testid="document-content"]');

		await expect(content.locator('h1')).toContainText('Safe Markdown Test');
		await expect(content.locator('h2')).toContainText('Subheading');
		await expect(content.locator('strong')).toContainText('Bold text');
		await expect(content.locator('em')).toContainText('italic text');
		await expect(content.locator('ul li')).toHaveCount(2);
		await expect(content.locator('pre code')).toContainText('function safeCode()');
		await expect(content.locator('a[href="https://example.com"]')).toContainText('Safe link');
		await expect(content.locator('img[src="/assets/safe-image.jpg"]')).toBeVisible();
		await expect(content.locator('blockquote')).toContainText('Blockquote content');
		await expect(content.locator('table')).toBeVisible();
		await expect(content.locator('hr')).toBeVisible();
	});

	test('should sanitize XSS in editor preview', async ({ page }) => {
		const maliciousContent = `<script>alert('Preview XSS');</script>
<img src="x" onerror="alert('Preview Image XSS')" />
<div onclick="alert('Preview Click XSS')">Click me</div>`;

		await page.locator('[data-testid="create-document"]').click();

		await page.locator('[data-testid="document-content-textarea"]').fill(maliciousContent);

		await expect(page.locator('[data-testid="markdown-preview"]')).toBeVisible();

		const previewContent = await page.locator('[data-testid="markdown-preview"]').innerHTML();
		expect(previewContent).not.toContain('<script>');
		expect(previewContent).not.toContain('onerror=');
		expect(previewContent).not.toContain('onclick=');
		expect(previewContent).not.toContain('alert(');
	});

	test('should sanitize XSS in shared document view', async ({ page }) => {
		const maliciousContent = `# Shared XSS Test

<script>alert('Shared XSS');</script>

<iframe src="javascript:alert('Iframe XSS')"></iframe>

<object data="javascript:alert('Object XSS')"></object>

<embed src="javascript:alert('Embed XSS')">

Normal content to verify rendering works.`;

		// Create document first
		await page.locator('[data-testid="create-document"]').click();
		await page.locator('[data-testid="document-title-input"]').fill('Shared XSS Test');
		await page.locator('[data-testid="document-content-textarea"]').fill(maliciousContent);
		await page.locator('[data-testid="save-document"]').click();

		// Create a share link
		await page.locator('[data-testid="share-document"]').click();
		await page.locator('[data-testid="create-share-link"]').click();

		const shareUrl = await page.locator('[data-testid="share-url"]').textContent();

		if (shareUrl) {
			// Visit shared document
			await page.goto(shareUrl);

			const content = await page.locator('[data-testid="shared-document-content"]').innerHTML();
			expect(content).not.toContain('<script>');
			expect(content).not.toContain('<iframe');
			expect(content).not.toContain('<object');
			expect(content).not.toContain('<embed');
			expect(content).not.toContain('javascript:');
			expect(content).toContain('Normal content to verify rendering works');
		}
	});

	test('should handle malicious CSS injection attempts', async ({ page }) => {
		const maliciousContent = `# CSS XSS Test

<style>
  body { background: url('javascript:alert("CSS XSS")'); }
  .malicious::before { content: url('javascript:alert("CSS XSS 2")'); }
</style>

<div style="background: url('javascript:alert()');">Malicious inline CSS</div>

<p style="color: red; font-size: 16px;">Safe inline CSS</p>`;

		await page.locator('[data-testid="create-document"]').click();

		await page.locator('[data-testid="document-title-input"]').fill('CSS XSS Test');
		await page.locator('[data-testid="document-content-textarea"]').fill(maliciousContent);

		await page.locator('[data-testid="save-document"]').click();

		await expect(page.locator('[data-testid="document-view"]')).toBeVisible();

		const content = await page.locator('[data-testid="document-content"]').innerHTML();
		expect(content).not.toContain('<style>');
		expect(content).not.toContain('javascript:');
		expect(content).toContain('Safe inline CSS');
	});

	test('should prevent data URL XSS attacks', async ({ page }) => {
		const maliciousContent = `# Data URL XSS Test

<img src="data:text/html,<script>alert('Data URL XSS')</script>" />

<iframe src="data:text/html,<script>alert('Iframe Data URL XSS')</script>"></iframe>

<object data="data:text/html,<script>alert('Object Data URL XSS')</script>"></object>

Regular content here.`;

		await page.locator('[data-testid="create-document"]').click();

		await page.locator('[data-testid="document-title-input"]').fill('Data URL XSS Test');
		await page.locator('[data-testid="document-content-textarea"]').fill(maliciousContent);

		await page.locator('[data-testid="save-document"]').click();

		await expect(page.locator('[data-testid="document-view"]')).toBeVisible();

		const content = await page.locator('[data-testid="document-content"]').innerHTML();
		expect(content).not.toContain('<iframe');
		expect(content).not.toContain('<object');
		expect(content).not.toContain('data:text/html');
		expect(content).toContain('Regular content here');
	});

	test('should validate that sanitization maintains markdown functionality', async ({ page }) => {
		const complexMarkdown = `# Complex Markdown Test

## Code Blocks
\`\`\`typescript
interface User {
  id: number;
  name: string;
}
\`\`\`

## Tables
| Feature | Status | Notes |
|---------|--------|-------|
| Headers | ✅ | Working |
| Lists   | ✅ | Working |
| Links   | ✅ | [Example](https://example.com) |

## Lists
1. First item
2. Second item
   - Nested item
   - Another nested

## Emphasis
**Bold** and *italic* and \`inline code\`

## Links and Images
[Internal link](/docs/example)
![Test image](/assets/test.jpg "Image title")

## Blockquotes
> This is a blockquote
> with multiple lines`;

		await page.locator('[data-testid="create-document"]').click();

		await page.locator('[data-testid="document-title-input"]').fill('Complex Markdown Test');
		await page.locator('[data-testid="document-content-textarea"]').fill(complexMarkdown);

		await page.locator('[data-testid="save-document"]').click();

		await expect(page.locator('[data-testid="document-view"]')).toBeVisible();

		const content = page.locator('[data-testid="document-content"]');

		await expect(content.locator('h1')).toContainText('Complex Markdown Test');
		await expect(content.locator('h2').first()).toContainText('Code Blocks');
		await expect(content.locator('pre code')).toContainText('interface User');
		await expect(content.locator('table')).toBeVisible();
		await expect(content.locator('thead th')).toHaveCount(3);
		await expect(content.locator('tbody tr')).toHaveCount(3);
		await expect(content.locator('ol li')).toHaveCount(2);
		await expect(content.locator('ul li')).toHaveCount(2);
		await expect(content.locator('strong')).toContainText('Bold');
		await expect(content.locator('em')).toContainText('italic');
		await expect(content.locator('code')).toContainText('inline code');
		await expect(content.locator('a[href="/docs/example"]')).toContainText('Internal link');
		await expect(content.locator('img[alt="Test image"]')).toBeVisible();
		await expect(content.locator('blockquote')).toContainText('This is a blockquote');
	});
});

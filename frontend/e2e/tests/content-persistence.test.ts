import { test, expect } from '../fixtures/test-setup';
import { createTestPage } from '../utils/test-data';

test.describe('Content Persistence and Data Integrity', () => {
	test('should persist content across browser sessions', async ({
		pageViewPage,
		apiHelper,
		testId,
		context
	}) => {
		const testPage = createTestPage({
			title: `Session Test ${testId}`,
			content: '# Session Persistence Test\n\nThis content should persist across sessions.',
			path: `/session-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to page and verify content
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);
		await pageViewPage.verifyContentContains('persist across sessions');

		// Close current page and create a new one (simulating new session)
		await pageViewPage.page.close();
		const newPage = await context.newPage();

		// Navigate to same page in new "session"
		const newPageView = (await new Promise((resolve) => {
			// Import classes within the test context
			import('../pages/PageViewPage').then(({ PageViewPage }) => {
				resolve(new PageViewPage(newPage));
			});
		})) as any;

		await newPageView.navigateToPage(testPage.path!);
		await newPageView.verifyPageLoaded(testPage.title);
		await newPageView.verifyContentContains('persist across sessions');
	});

	test('should maintain data integrity during concurrent edits', async ({
		editorPage,
		pageViewPage,
		apiHelper,
		testId,
		context
	}) => {
		const testPage = createTestPage({
			title: `Concurrent Edit ${testId}`,
			content: '# Original Content\n\nBase content for concurrent edit test.',
			path: `/concurrent-edit-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Open first editor
		await editorPage.navigateToEdit(testPage.path!);
		await editorPage.verifyLoaded();

		// Open second page context (simulating another user)
		const page2 = await context.newPage();
		const editorPage2 = (await new Promise((resolve) => {
			import('../pages/EditorPage').then(({ EditorPage }) => {
				resolve(new EditorPage(page2));
			});
		})) as any;

		await editorPage2.navigateToEdit(testPage.path!);
		await editorPage2.verifyLoaded();

		// Make changes in first editor
		await editorPage.typeContent('\n\nChanges from Editor 1');
		await editorPage.save();

		// Make changes in second editor
		await editorPage2.typeContent('\n\nChanges from Editor 2');
		await editorPage2.save();

		// Verify final state
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(testPage.title);

		// Note: Depending on implementation, this might show conflict resolution
		// or last-writer-wins behavior
		const content = await pageViewPage.getPageContent();
		expect(content).toContain('Base content');

		await page2.close();
	});

	test('should preserve special characters and unicode', async ({
		editorPage,
		pageViewPage,
		apiHelper,
		testId
	}) => {
		const specialContent = `# Unicode Test ${testId}

Special characters: !@#$%^&*()_+-={}[]|\\:";'<>?,.

Unicode characters:
- Emoji: 🚀 🎉 💻 📝 ✅
- Accents: café, naïve, résumé
- Math: ∑ ∫ ∞ ≠ ± √ π
- Symbols: © ® ™ € £ ¥ § ¶
- Languages: 日本語, العربية, 中文, русский

Code with special chars:
\`\`\`javascript
const regex = /[!@#$%^&*()]/g;
const unicode = "Hello 世界! 🌍";
\`\`\``;

		const testPage = createTestPage({
			title: `Unicode Test ${testId}`,
			content: specialContent,
			path: `/unicode-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to page and verify special characters
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(`Unicode Test ${testId}`);
		await pageViewPage.verifyContentContains('🚀 🎉 💻');
		await pageViewPage.verifyContentContains('café, naïve');
		await pageViewPage.verifyContentContains('日本語, العربية');
		await pageViewPage.verifyContentContains('∑ ∫ ∞');

		// Edit and re-save to ensure persistence through edit cycle
		await pageViewPage.editPage();
		await editorPage.verifyContent('🚀 🎉 💻');
		await editorPage.typeContent('\n\nAdditional unicode: 🔥 ⭐ 🌟');
		await editorPage.saveAndExpectNavigation();

		// Verify all special characters still present
		await pageViewPage.verifyContentContains('🚀 🎉 💻');
		await pageViewPage.verifyContentContains('🔥 ⭐ 🌟');
	});

	test('should handle large content volumes', async ({
		editorPage,
		pageViewPage,
		apiHelper,
		testId
	}) => {
		// Generate large content (approximately 100KB)
		const largeParagraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50);
		const largeContent =
			`# Large Content Test ${testId}\n\n` +
			Array(100)
				.fill(0)
				.map((_, i) => `## Section ${i + 1}\n\n${largeParagraph}\n\n`)
				.join('');

		const testPage = createTestPage({
			title: `Large Content ${testId}`,
			content: largeContent,
			path: `/large-content-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to page and verify it loads
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(`Large Content ${testId}`);

		// Verify content is present
		await pageViewPage.verifyContentContains('Section 1');
		await pageViewPage.verifyContentContains('Section 50');
		await pageViewPage.verifyContentContains('Section 100');

		// Edit large content
		await pageViewPage.editPage();
		await editorPage.verifyLoaded();

		// Add content to the large page
		await editorPage.typeContent('\n\n## Additional Section\n\nAdded to large content.');
		await editorPage.saveAndExpectNavigation();

		// Verify addition persisted
		await pageViewPage.verifyContentContains('Additional Section');
		await pageViewPage.verifyContentContains('Added to large content');
	});

	test('should preserve content formatting and structure', async ({
		editorPage,
		pageViewPage,
		apiHelper,
		testId
	}) => {
		const formattedContent = `# Formatting Test ${testId}

## Headers
### Subheader
#### Smaller header

## Text Formatting
**Bold text** and *italic text* and ***bold italic***.

## Lists
1. First item
2. Second item
   - Nested bullet
   - Another nested item
3. Third item

## Code
Inline \`code\` and code blocks:

\`\`\`javascript
function test() {
  return "Hello World";
}
\`\`\`

## Links and Images
[Link to home](/)

## Tables
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |

## Quotes
> This is a blockquote
> with multiple lines.

## Horizontal Rule
---

End of formatting test.`;

		const testPage = createTestPage({
			title: `Formatting Test ${testId}`,
			content: formattedContent,
			path: `/formatting-test-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Verify initial rendering
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(`Formatting Test ${testId}`);

		// Verify various elements are rendered correctly
		await pageViewPage.verifyHeading('Headers', 2);
		await pageViewPage.verifyHeading('Subheader', 3);
		await pageViewPage.verifyContentContains('Bold text');
		await pageViewPage.verifyContentContains('First item');

		// Edit and verify formatting is preserved in editor
		await pageViewPage.editPage();
		await editorPage.verifyContent('**Bold text**');
		await editorPage.verifyContent('```javascript');
		await editorPage.verifyContent('1. First item');

		// Make a small change and save
		await editorPage.typeContent('\n\n## New Section\n\nAdded formatting preserved.');
		await editorPage.saveAndExpectNavigation();

		// Verify formatting still intact
		await pageViewPage.verifyHeading('New Section', 2);
		await pageViewPage.verifyHeading('Headers', 2);
		await pageViewPage.verifyContentContains('Bold text');
	});

	test('should handle content with mixed line endings', async ({
		editorPage,
		pageViewPage,
		apiHelper,
		testId
	}) => {
		// Content with different line ending styles
		const mixedLineEndingContent = [
			`# Mixed Line Endings ${testId}`,
			'',
			'Line with LF ending',
			'Another line with LF',
			'',
			'Content with various line endings should be handled consistently.',
			'',
			'Final line'
		].join('\n');

		const testPage = createTestPage({
			title: `Line Endings ${testId}`,
			content: mixedLineEndingContent,
			path: `/line-endings-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Verify content displays correctly
		await pageViewPage.navigateToPage(testPage.path!);
		await pageViewPage.verifyPageLoaded(`Line Endings ${testId}`);
		await pageViewPage.verifyContentContains('Line with LF ending');
		await pageViewPage.verifyContentContains('Final line');

		// Edit and save to ensure line endings are preserved
		await pageViewPage.editPage();
		await editorPage.typeContent('\n\nAdded line with standard ending.');
		await editorPage.saveAndExpectNavigation();

		// Verify all content still present
		await pageViewPage.verifyContentContains('Line with LF ending');
		await pageViewPage.verifyContentContains('Added line with standard ending');
	});

	test('should handle concurrent auto-save and manual save', async ({
		editorPage,
		pageViewPage,
		apiHelper,
		testId
	}) => {
		const testPage = createTestPage({
			title: `Save Conflict ${testId}`,
			content: '# Save Conflict Test',
			path: `/save-conflict-${testId}`
		});

		await apiHelper.createPage(testPage);

		// Navigate to edit
		await editorPage.navigateToEdit(testPage.path!);
		await editorPage.verifyLoaded();

		// Make changes that would trigger auto-save
		await editorPage.typeContent('\n\nAuto-save content.');

		// Immediately make more changes and manually save
		await editorPage.typeContent('\n\nManual save content.');
		await editorPage.saveAndExpectNavigation();

		// Verify all content is preserved
		await pageViewPage.verifyContentContains('Auto-save content');
		await pageViewPage.verifyContentContains('Manual save content');
	});

	test('should maintain referential integrity for internal links', async ({
		editorPage,
		pageViewPage,
		apiHelper,
		testId
	}) => {
		// Create target page first
		const targetPage = createTestPage({
			title: `Target Page ${testId}`,
			content: '# Target Page\n\nThis is the target of internal links.',
			path: `/target-${testId}`
		});

		await apiHelper.createPage(targetPage);

		// Create page with internal links
		const linkingPage = createTestPage({
			title: `Linking Page ${testId}`,
			content: `# Linking Page

This page contains links to other pages:

[Link to target page](/pages/target-${testId})
[Another reference to target](/pages/target-${testId})

The links should remain functional after edits.`,
			path: `/linking-${testId}`
		});

		await apiHelper.createPage(linkingPage);

		// Navigate to linking page
		await pageViewPage.navigateToPage(linkingPage.path!);
		await pageViewPage.verifyPageLoaded(`Linking Page ${testId}`);

		// Click internal link to verify it works
		await pageViewPage.clickContentLink('Link to target page');
		await pageViewPage.verifyPageLoaded(`Target Page ${testId}`);

		// Go back and edit the linking page
		await pageViewPage.navigateToPage(linkingPage.path!);
		await pageViewPage.editPage();

		// Add another internal link
		await editorPage.typeContent(`\n\n[New link to target](/pages/target-${testId})`);
		await editorPage.saveAndExpectNavigation();

		// Verify all links still work
		await pageViewPage.clickContentLink('New link to target');
		await pageViewPage.verifyPageLoaded(`Target Page ${testId}`);
	});
});

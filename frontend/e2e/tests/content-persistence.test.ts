import { test, expect } from '../fixtures';
import { createTestPage as createTestDocument } from '../utils/test-data';

test.describe('Content Persistence and Data Integrity', () => {
	test('should persist content across browser sessions', async ({
		documentViewPage,
		apiHelper,
		testId,
		context
	}) => {
		const testDocument = createTestDocument({
			title: `Session Test ${testId}`,
			content: '# Session Persistence Test\n\nThis content should persist across sessions.',
			path: `/session-test-${testId}`
		});

		await apiHelper.createDocument(testDocument);

		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
		await documentViewPage.verifyContentContains('persist across sessions');

		await documentViewPage.page.close();
		const newPage = await context.newPage();

		const { DocumentViewPage } = await import('../pages/DocumentViewPage');
		const newDocumentView = new DocumentViewPage(newPage);

		await newDocumentView.navigateToDocument(testDocument.path!);
		await newDocumentView.verifyDocumentLoaded(testDocument.title);
		await newDocumentView.verifyContentContains('persist across sessions');
	});

	test('should maintain data integrity during concurrent edits', async ({
		editorPage,
		documentViewPage,
		apiHelper,
		testId,
		context
	}) => {
		const testDocument = createTestDocument({
			title: `Concurrent Edit ${testId}`,
			content: '# Original Content\n\nBase content for concurrent edit test.',
			path: `/concurrent-edit-${testId}`
		});

		await apiHelper.createDocument(testDocument);

		await editorPage.navigateToEdit(testDocument.path!);
		await editorPage.verifyLoaded();

		const page2 = await context.newPage();
		const { EditorPage } = await import('../pages/EditorPage');
		const editorPage2 = new EditorPage(page2);

		await editorPage2.navigateToEdit(testDocument.path!);
		await editorPage2.verifyLoaded();

		await editorPage.typeContent('\n\nChanges from Editor 1');
		await editorPage.save();
		await editorPage2.typeContent('\n\nChanges from Editor 2');
		await editorPage2.save();

		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		const content = await documentViewPage.getDocumentContent();
		expect(content).toContain('Base content');

		await page2.close();
	});

	test('should preserve special characters and unicode', async ({
		editorPage,
		documentViewPage,
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

		const testDocument = createTestDocument({
			title: `Unicode Test ${testId}`,
			content: specialContent,
			path: `/unicode-test-${testId}`
		});

		await apiHelper.createDocument(testDocument);

		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(`Unicode Test ${testId}`);
		await documentViewPage.verifyContentContains('🚀 🎉 💻');
		await documentViewPage.verifyContentContains('café, naïve');
		await documentViewPage.verifyContentContains('日本語, العربية');
		await documentViewPage.verifyContentContains('∑ ∫ ∞');

		await documentViewPage.editDocument();
		await editorPage.verifyContent('🚀 🎉 💻');
		await editorPage.typeContent('\n\nAdditional unicode: 🔥 ⭐ 🌟');
		await editorPage.saveAndExpectNavigation();

		await documentViewPage.verifyContentContains('🚀 🎉 💻');
		await documentViewPage.verifyContentContains('🔥 ⭐ 🌟');
	});

	test('should handle large content volumes', async ({
		editorPage,
		documentViewPage,
		apiHelper,
		testId
	}) => {
		const largeParagraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50);
		const largeContent =
			`# Large Content Test ${testId}\n\n` +
			Array(100)
				.fill(0)
				.map((_, i) => `## Section ${i + 1}\n\n${largeParagraph}\n\n`)
				.join('');

		const testDocument = createTestDocument({
			title: `Large Content ${testId}`,
			content: largeContent,
			path: `/large-content-${testId}`
		});

		await apiHelper.createDocument(testDocument);

		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(`Large Content ${testId}`);

		await documentViewPage.verifyContentContains('Section 1');
		await documentViewPage.verifyContentContains('Section 50');
		await documentViewPage.verifyContentContains('Section 100');

		await documentViewPage.editDocument();
		await editorPage.verifyLoaded();

		await editorPage.typeContent('\n\n## Additional Section\n\nAdded to large content.');
		await editorPage.saveAndExpectNavigation();

		await documentViewPage.verifyContentContains('Additional Section');
		await documentViewPage.verifyContentContains('Added to large content');
	});

	test('should preserve content formatting and structure', async ({
		editorPage,
		documentViewPage,
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

		const testDocument = createTestDocument({
			title: `Formatting Test ${testId}`,
			content: formattedContent,
			path: `/formatting-test-${testId}`
		});

		await apiHelper.createDocument(testDocument);

		// Verify initial rendering
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(`Formatting Test ${testId}`);

		// Verify various elements are rendered correctly
		await documentViewPage.verifyHeading('Headers', 2);
		await documentViewPage.verifyHeading('Subheader', 3);
		await documentViewPage.verifyContentContains('Bold text');
		await documentViewPage.verifyContentContains('First item');

		// Edit and verify formatting is preserved in editor
		await documentViewPage.editDocument();
		await editorPage.verifyContent('**Bold text**');
		await editorPage.verifyContent('```javascript');
		await editorPage.verifyContent('1. First item');

		// Make a small change and save
		await editorPage.typeContent('\n\n## New Section\n\nAdded formatting preserved.');
		await editorPage.saveAndExpectNavigation();

		// Verify formatting still intact
		await documentViewPage.verifyHeading('New Section', 2);
		await documentViewPage.verifyHeading('Headers', 2);
		await documentViewPage.verifyContentContains('Bold text');
	});

	test('should handle content with mixed line endings', async ({
		editorPage,
		documentViewPage,
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

		const testDocument = createTestDocument({
			title: `Line Endings ${testId}`,
			content: mixedLineEndingContent,
			path: `/line-endings-${testId}`
		});

		await apiHelper.createDocument(testDocument);

		// Verify content displays correctly
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(`Line Endings ${testId}`);
		await documentViewPage.verifyContentContains('Line with LF ending');
		await documentViewPage.verifyContentContains('Final line');

		// Edit and save to ensure line endings are preserved
		await documentViewPage.editDocument();
		await editorPage.typeContent('\n\nAdded line with standard ending.');
		await editorPage.saveAndExpectNavigation();

		// Verify all content still present
		await documentViewPage.verifyContentContains('Line with LF ending');
		await documentViewPage.verifyContentContains('Added line with standard ending');
	});

	test('should maintain referential integrity for internal links', async ({
		editorPage,
		documentViewPage,
		apiHelper,
		testId
	}) => {
		// Create target document first
		const targetDocument = createTestDocument({
			title: `Target Document ${testId}`,
			content: '# Target Document\n\nThis is the target of internal links.',
			path: `/target-${testId}`
		});

		await apiHelper.createDocument(targetDocument);

		// Create document with internal links
		const linkingDocument = createTestDocument({
			title: `Linking Document ${testId}`,
			content: `# Linking Document

This document contains links to other documents:

[Link to target document](/documents/target-${testId})
[Another reference to target](/documents/target-${testId})

The links should remain functional after edits.`,
			path: `/linking-${testId}`
		});

		await apiHelper.createDocument(linkingDocument);

		// Navigate to linking document
		await documentViewPage.navigateToDocument(linkingDocument.path!);
		await documentViewPage.verifyDocumentLoaded(`Linking Document ${testId}`);

		// Click internal link to verify it works
		await documentViewPage.clickContentLink('Link to target document');
		await documentViewPage.verifyDocumentLoaded(`Target Document ${testId}`);

		// Go back and edit the linking document
		await documentViewPage.navigateToDocument(linkingDocument.path!);
		await documentViewPage.editDocument();

		// Add another internal link
		await editorPage.typeContent(`\n\n[New link to target](/documents/target-${testId})`);
		await editorPage.saveAndExpectNavigation();

		// Verify all links still work
		await documentViewPage.clickContentLink('New link to target');
		await documentViewPage.verifyDocumentLoaded(`Target Document ${testId}`);
	});
});

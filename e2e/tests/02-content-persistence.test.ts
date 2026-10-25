import { test, expect } from '../fixtures';
import { DocumentViewPage } from '../pages/DocumentViewPage';
import { EditorPage } from '../pages/EditorPage';
import { createTestDocument } from '../utils/test-data';

test.describe('Content Persistence and Data Integrity', () => {
	test('should persist content across browser sessions', async ({
		documentViewPage,
		withSimpleTestDocument,
		context
	}) => {
		const testDocument = withSimpleTestDocument;

		await documentViewPage.openDocument(testDocument);
		await documentViewPage.verifyContentContains('simple test document');

		await documentViewPage.page.close();
		const newPage = await context.newPage();

		const newDocumentView = new DocumentViewPage(newPage);

		await newDocumentView.openDocument(testDocument);
		await newDocumentView.verifyContentContains('simple test document');
	});

	test('should maintain data integrity during concurrent edits', async ({
		editorPage,
		documentViewPage,
		withSimpleTestDocument,
		context
	}) => {
		const testDocument = withSimpleTestDocument;

		await editorPage.navigateToEdit(testDocument.path!);
		await editorPage.verifyLoaded();

		const page2 = await context.newPage();
		const editorPage2 = new EditorPage(page2);

		await editorPage2.navigateToEdit(testDocument.path!);
		await editorPage2.verifyLoaded();

		await editorPage.typeContent('\n\nChanges from Editor 1');
		await editorPage.save();
		await editorPage2.typeContent('\n\nChanges from Editor 2');
		await editorPage2.save();

		await documentViewPage.openDocument(testDocument);

		// Last save wins: the second editor's change is what's stored.
		const content = await documentViewPage.getDocumentContent();
		expect(content).toContain('Changes from Editor 2');

		await page2.close();
	});

	test('should preserve special characters and unicode', async ({
		editorPage,
		documentViewPage,
		withUnicodeDocument: testDocument
	}) => {
		await documentViewPage.openDocument(testDocument);
		await documentViewPage.verifyContentContains('🚀 🌟 ✅');
		await documentViewPage.verifyContentContains('ÄÖÜß çñ');
		await documentViewPage.verifyContentContains('中文 日本語 한국어');
		await documentViewPage.verifyContentContains('∑ ∂ ∆');

		await documentViewPage.editDocument();
		await editorPage.verifyLoaded();
		await editorPage.verifyContent('🚀 🌟 ✅');
		await editorPage.typeContent('\n\nAdditional unicode: 🔥 ⭐ 💡');
		await editorPage.saveAndExpectNavigation();

		await documentViewPage.verifyContentContains('🚀 🌟 ✅');
		await documentViewPage.verifyContentContains('🔥 ⭐ 💡');
	});

	test('should handle large content volumes', async ({
		editorPage,
		documentViewPage,
		withLargeDocument: testDocument
	}) => {
		await documentViewPage.openDocument(testDocument);

		await documentViewPage.verifyContentContains('Large Content Test');
		await documentViewPage.verifyContentContains('Lorem ipsum dolor sit amet');
		await documentViewPage.verifyContentContains('Section 2');

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

		const testDocument = await apiHelper.seedDocument({
			title: `Formatting Test ${testId}`,
			content: formattedContent,
			path: `/formatting-test-${testId}`
		});

		// Verify initial rendering
		await documentViewPage.openDocument(testDocument);

		// Verify various elements are rendered correctly
		await documentViewPage.verifyHeading('Headers', 2);
		await documentViewPage.verifyHeading('Subheader', 3);
		await documentViewPage.verifyContentContains('Bold text');
		await documentViewPage.verifyContentContains('First item');

		// Edit and verify formatting is preserved in editor
		await documentViewPage.editDocument();
		await editorPage.verifyLoaded();
		await editorPage.verifyContent('**Bold text**');
		await editorPage.verifyContent('```javascript');
		await editorPage.verifyContent('1. First item');

		// Make a small change and save
		await editorPage.appendContent('\n\n## New Section\n\nAdded formatting preserved.');
		await editorPage.saveAndExpectNavigation();

		// Wait for document to fully load after navigation
		await documentViewPage.verifyDocumentLoaded(`Formatting Test ${testId}`);

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

		const testDocument = await apiHelper.seedDocument({
			title: `Line Endings ${testId}`,
			content: mixedLineEndingContent,
			path: `/line-endings-${testId}`
		});

		// Verify content displays correctly
		await documentViewPage.openDocument(testDocument);
		await documentViewPage.verifyContentContains('Line with LF ending');
		await documentViewPage.verifyContentContains('Final line');

		// Edit and save to ensure line endings are preserved
		await documentViewPage.editDocument();
		await editorPage.verifyLoaded();
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
		await apiHelper.seedDocument({
			title: `Target Document ${testId}`,
			content: '# Target Document\n\nThis is the target of internal links.',
			path: `/target-${testId}`
		});

		// Create document with internal links
		const linkingDocument = await apiHelper.seedDocument({
			title: `Linking Document ${testId}`,
			content: `# Linking Document

This document contains links to other documents:

[Link to target document](/documents/target-${testId})
[Another reference to target](/documents/target-${testId})

The links should remain functional after edits.`,
			path: `/linking-${testId}`
		});

		// Navigate to linking document
		await documentViewPage.openDocument(linkingDocument);

		// Click internal link to verify it works
		await documentViewPage.clickContentLink('Link to target document');
		await documentViewPage.verifyDocumentLoaded(`Target Document ${testId}`);

		// Go back and edit the linking document
		await documentViewPage.openDocument(linkingDocument);
		await documentViewPage.editDocument();
		await editorPage.verifyLoaded();

		// Add another internal link
		await editorPage.typeContent(`\n\n[New link to target](/documents/target-${testId})`);
		await editorPage.saveAndExpectNavigation();

		// Verify all links still work
		await documentViewPage.clickContentLink('New link to target');
		await documentViewPage.verifyDocumentLoaded(`Target Document ${testId}`);
	});

	test('should prevent creating documents with duplicate names', async ({
		editorPage,
		documentViewPage,
		testId
	}) => {
		const testDocument = createTestDocument({
			title: `Duplicate Test ${testId}`,
			content: `# Duplicate Test ${testId}\n\nThis is the first document.`,
			tags: ['test', 'duplicate']
		});

		// Create the first document
		await editorPage.navigateToNew();
		await editorPage.verifyLoaded();
		await editorPage.fillDocumentDetails(
			testDocument.title,
			testDocument.content,
			testDocument.tags!
		);
		await editorPage.saveAndExpectNavigation();

		// Verify first document was created
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// Try to create a second document with the same name
		await editorPage.navigateToNew();
		await editorPage.verifyLoaded();

		// Type the same title (this should trigger the warning)
		await editorPage.fillTitle(testDocument.title);

		// The duplicate check is debounced; the web-first assertion waits it out.
		const warningAlert = editorPage.page
			.getByRole('alert')
			.filter({ hasText: 'A document already exists' });
		await expect(warningAlert).toBeVisible();

		// Verify save button is disabled when duplicate exists
		const saveButton = editorPage.saveButton;
		await expect(saveButton).toBeDisabled();

		// Change title to something unique
		const uniqueTitle = `${testDocument.title} Unique`;
		await editorPage.fillTitle(uniqueTitle);

		// Verify warning disappears once the debounced check re-runs
		await expect(warningAlert).not.toBeVisible();

		// Verify save button is enabled again
		await expect(saveButton).toBeEnabled();

		// Fill content and save successfully
		await editorPage.fillContent('This is a unique document.');
		await editorPage.saveAndExpectNavigation();

		// Verify the unique document was created
		await documentViewPage.verifyDocumentLoaded(uniqueTitle);
	});
});

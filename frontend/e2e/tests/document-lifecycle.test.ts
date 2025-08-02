import { test, expect } from '../fixtures/test-setup';
import { createTestPage as createTestDocument } from '../utils/test-data';

// serial enforces not running in parallel
test.describe.serial('Document Lifecycle', () => {
	test('should create a new document successfully', async ({
		editorPage,
		documentViewPage,
		testId
	}) => {
		const testDocument = createTestDocument({
			title: `Test Document ${testId}`,
			content: `# Test Document ${testId}\n\nThis is a test document for document creation.`,
			tags: ['test', 'lifecycle']
		});

		// Navigate directly to new document editor
		await editorPage.navigateToNew();

		// Verify editor loaded
		await editorPage.verifyLoaded();
		await editorPage.expectUrl('/new');

		// Fill in document details
		await editorPage.fillDocumentDetails(
			testDocument.title,
			testDocument.content,
			testDocument.tags!
		);

		// Save and navigate to document view
		await editorPage.saveAndExpectNavigation();

		// Verify document was created and displays correctly
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
		await documentViewPage.verifyContentContains('This is a test document for document creation');
		await documentViewPage.verifyTags(testDocument.tags!);
	});

	test('should edit an existing document', async ({
		editorPage,
		documentViewPage,
		apiHelper,
		testId
	}) => {
		// Create a document via API first
		const originalDocument = createTestDocument({
			title: `Original Document ${testId}`,
			content: '# Original Content\n\nThis content will be edited.',
			path: `/test-edit-${testId}`
		});

		await apiHelper.createDocument(originalDocument);

		// Navigate to the document
		await documentViewPage.navigateToDocument(originalDocument.path!);
		await documentViewPage.verifyDocumentLoaded(originalDocument.title);

		// Click edit button
		await documentViewPage.editDocument();

		// Verify editor loaded with existing content
		await editorPage.verifyLoaded();
		await editorPage.verifyTitle(originalDocument.title);
		await editorPage.verifyContent('Original Content');

		// Modify the content
		const updatedContent = '# Updated Content\n\nThis content has been edited via e2e test.';
		await editorPage.clearContent();
		await editorPage.typeContent(updatedContent);

		// Save changes
		await editorPage.saveAndExpectNavigation();

		// Verify changes are reflected
		await documentViewPage.verifyContentContains('Updated Content');
		await documentViewPage.verifyContentContains('edited via e2e test');
	});

	test('should delete a document', async ({ documentViewPage, apiHelper, testId }) => {
		// Create a document to delete
		const documentToDelete = createTestDocument({
			title: `Delete Me ${testId}`,
			content: '# Document to Delete\n\nThis document will be deleted.',
			path: `/delete-test-${testId}`
		});

		await apiHelper.createDocument(documentToDelete);

		// Navigate to the document
		await documentViewPage.navigateToDocument(documentToDelete.path!);
		await documentViewPage.verifyDocumentLoaded(documentToDelete.title);

		// Delete the document
		await documentViewPage.deleteDocument();

		// Verify redirect and document no longer exists
		await documentViewPage.expectUrl('/');

		// Try to navigate to deleted document - should show 404
		await documentViewPage.navigateToDocument(documentToDelete.path!);
		await documentViewPage.verifyDocumentNotFound();
	});

	test('should handle viewing non-existent document', async ({ documentViewPage, testId }) => {
		// Try to navigate to a document that doesn't exist
		const nonExistentPath = `/non-existent-document-${testId}`;
		await documentViewPage.navigateToDocument(nonExistentPath);

		// Should show 404 or not found message
		await documentViewPage.verifyDocumentNotFound();
	});

	test('should preserve content when navigating away and back', async ({
		editorPage,
		documentViewPage,
		apiHelper,
		testId
	}) => {
		// Create a document via API
		const testDocument = createTestDocument({
			title: `Navigation Test ${testId}`,
			content: '# Navigation Test\n\nContent to preserve.',
			path: `/navigation-test-${testId}`
		});

		await apiHelper.createDocument(testDocument);

		// Navigate to document view
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// Navigate to edit
		await documentViewPage.editDocument();
		await editorPage.verifyLoaded();
		await editorPage.verifyContent('Navigation Test');

		// Navigate back to view without saving
		await editorPage.cancel();

		// Verify we're back on document view with original content
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
		await documentViewPage.verifyContentContains('Content to preserve');
	});

	test('should display document metadata correctly', async ({
		documentViewPage,
		apiHelper,
		testId
	}) => {
		const testDocument = createTestDocument({
			title: `Metadata Test ${testId}`,
			content: '# Metadata Test\n\nTesting metadata display.',
			path: `/metadata-test-${testId}`,
			tags: ['metadata', 'test', 'e2e']
		});

		await apiHelper.createDocument(testDocument);

		// Navigate to document
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// Verify metadata is displayed
		await documentViewPage.verifyMetadata();
		await documentViewPage.verifyTags(testDocument.tags!);
	});

	test('should render markdown content correctly', async ({
		documentViewPage,
		apiHelper,
		testId
	}) => {
		const markdownContent = `# Main Heading

## Subheading

This is **bold text** and this is *italic text*.

\`\`\`javascript
console.log('Hello, World!');
\`\`\`

- List item 1
- List item 2
- List item 3

[Link to home](/)`;

		const testDocument = createTestDocument({
			title: `Markdown Test ${testId}`,
			content: markdownContent,
			path: `/markdown-test-${testId}`
		});

		await apiHelper.createDocument(testDocument);

		// Navigate to document
		await documentViewPage.navigateToDocument(testDocument.path!);
		await documentViewPage.verifyDocumentLoaded(testDocument.title);

		// Verify markdown has been rendered to HTML
		await documentViewPage.verifyMarkdownRendering();
		await documentViewPage.verifyHeading('Main Heading', 1);
		await documentViewPage.verifyHeading('Subheading', 2);

		// Verify we have expected number of elements
		const headingCount = await documentViewPage.getHeadingCount();
		expect(headingCount).toBeGreaterThanOrEqual(2);

		const linkCount = await documentViewPage.getLinkCount();
		expect(linkCount).toBeGreaterThanOrEqual(1);
	});
});

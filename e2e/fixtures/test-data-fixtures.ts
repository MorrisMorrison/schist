/**
 * Test data fixtures for consistent test data setup
 */

import { test as base } from './test-setup';
import {
	createTestDocument,
	createTestFolder,
	createComplexTestDocument,
	createSimpleTestDocument,
	TestDocumentData,
	TestFolderData
} from '../utils/test-data';
import { createTestDocuments } from '../utils/api-helpers';

// Extend test with data fixtures
export const test = base.extend<{
	// Pre-created test data (not created in backend)
	testDocument: TestDocumentData;
	simpleTestDocument: TestDocumentData;
	complexTestDocument: TestDocumentData;
	testFolder: TestFolderData;

	// Setup fixtures that create data in the backend
	withTestDocument: TestDocumentData;
	withSimpleTestDocument: TestDocumentData;
	withComplexTestDocument: TestDocumentData;
	withMultipleDocuments: TestDocumentData[];
	withSpecialContentTypes: {
		unicodeDocument: TestDocumentData;
		largeDocument: TestDocumentData;
		formattedDocument: TestDocumentData;
		mixedLineEndingDocument: TestDocumentData;
	};
}>({
	// Basic test data (not created in backend)
	testDocument: async ({ testId }, use) => {
		const document = createTestDocument({
			title: `Test Document ${testId}`,
			path: `/test-document-${testId}`
		});
		await use(document);
	},

	simpleTestDocument: async ({ testId }, use) => {
		const document = createSimpleTestDocument({
			title: `Simple ${testId}`,
			path: `/simple-${testId}`
		});
		await use(document);
	},

	complexTestDocument: async ({ testId }, use) => {
		const document = createComplexTestDocument({
			title: `Complex ${testId}`,
			path: `/complex-${testId}`
		});
		await use(document);
	},

	testFolder: async ({ testId }, use) => {
		const folder = createTestFolder({
			name: `test-folder-${testId}`,
			path: `/test-folder-${testId}`
		});
		await use(folder);
	},

	// Data fixtures that actually create content in the backend
	withTestDocument: async ({ apiHelper, testDocument }, use) => {
		const result = await apiHelper.createDocument(testDocument);
		if (result.status !== 201) {
			throw new Error(`Failed to create test document: ${result.error}`);
		}

		await use(testDocument);

		// Cleanup is handled by apiHelper fixture
	},

	withSimpleTestDocument: async ({ apiHelper, simpleTestDocument }, use) => {
		const result = await apiHelper.createDocument(simpleTestDocument);
		if (result.status !== 201) {
			throw new Error(`Failed to create simple test document: ${result.error}`);
		}

		await use(simpleTestDocument);

		// Cleanup is handled by apiHelper fixture
	},

	withComplexTestDocument: async ({ apiHelper, complexTestDocument }, use) => {
		const result = await apiHelper.createDocument(complexTestDocument);
		if (result.status !== 201) {
			throw new Error(`Failed to create complex test document: ${result.error}`);
		}

		await use(complexTestDocument);

		// Cleanup is handled by apiHelper fixture
	},

	withMultipleDocuments: async ({ apiHelper, testId }, use) => {
		// Create multiple test documents
		const documents = [
			createSimpleTestDocument({
				title: `Document 1 ${testId}`,
				path: `/document-1-${testId}`,
				tags: ['test', 'doc1']
			}),
			createTestDocument({
				title: `Document 2 ${testId}`,
				path: `/document-2-${testId}`,
				tags: ['test', 'doc2']
			}),
			createComplexTestDocument({
				title: `Document 3 ${testId}`,
				path: `/document-3-${testId}`,
				tags: ['test', 'doc3', 'complex']
			})
		];

		await createTestDocuments(apiHelper, documents);
		await use(documents);

		// Cleanup is handled by apiHelper fixture
	},

	withSpecialContentTypes: async ({ apiHelper, testId }, use) => {
		// Create documents with special content types for persistence testing
		const unicodeDocument = createTestDocument({
			title: `Unicode Test ${testId}`,
			content: `# Unicode Content Test\n\n## Emojis and Symbols\n🚀 🌟 ✅ ❌ 🔥 💡\n\n## Special Characters\nÄÖÜß çñ אב 中文 日本語 한국어\n\n## Math Symbols\n∑ ∂ ∆ π ∞ ≠ ≤ ≥\n\n## Currency\n$ € £ ¥ ₹ ₿`,
			path: `/unicode-${testId}`,
			tags: ['unicode', 'special-chars']
		});

		const largeDocument = createTestDocument({
			title: `Large Content ${testId}`,
			content:
				`# Large Content Test\n\n` +
				'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(500) +
				'\n\n## Section 2\n\n' +
				'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(300),
			path: `/large-content-${testId}`,
			tags: ['large', 'performance']
		});

		const formattedDocument = createTestDocument({
			title: `Formatted Content ${testId}`,
			content: `# Formatted Document Test

## Headers
### Level 3
#### Level 4

## Lists
1. Ordered list item 1
2. Ordered list item 2
   - Nested unordered
   - Another nested item

## Code Blocks
\`\`\`javascript
function test() {
  return "formatted content";
}
\`\`\`

## Tables
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |

## Links and Images
[Link](https://example.com)
![Alt text](image.png)

**Bold** and *italic* text.`,
			path: `/formatted-${testId}`,
			tags: ['formatted', 'markdown']
		});

		const mixedLineEndingContent = `# Mixed Line Endings${testId}\r\n\r\nThis line uses CRLF\r\n\nThis line uses LF\n\rThis line uses CR\r\n\r\nMixed content should be preserved.`;
		const mixedLineEndingDocument = createTestDocument({
			title: `Line Endings ${testId}`,
			content: mixedLineEndingContent,
			path: `/line-endings-${testId}`,
			tags: ['line-endings', 'encoding']
		});

		const documents = [unicodeDocument, largeDocument, formattedDocument, mixedLineEndingDocument];
		await createTestDocuments(apiHelper, documents);

		await use({
			unicodeDocument,
			largeDocument,
			formattedDocument,
			mixedLineEndingDocument
		});
	}
});

// Re-export expect
export { expect } from '@playwright/test';

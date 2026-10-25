/**
 * Test data fixtures for consistent test data setup
 */

import { test as base } from './test-setup';
import {
	createTestDocument,
	createComplexTestDocument,
	createSimpleTestDocument,
	TestDocumentData
} from '../utils/test-data';

// Extend test with data fixtures
export const test = base.extend<{
	// Pre-created test data (not created in backend)
	testDocument: TestDocumentData;

	// Setup fixtures that create data in the backend
	withTestDocument: TestDocumentData;
	withSimpleTestDocument: TestDocumentData;
	withComplexTestDocument: TestDocumentData;
	withMultipleDocuments: TestDocumentData[];
	withUnicodeDocument: TestDocumentData;
	withLargeDocument: TestDocumentData;
}>({
	// Basic test data (not created in backend)
	testDocument: async ({ testId }, use) => {
		const document = createTestDocument({
			title: `Test Document ${testId}`,
			path: `/test-document-${testId}`
		});
		await use(document);
	},

	// Data fixtures that actually create content in the backend. Cleanup is
	// handled by the apiHelper fixture.
	withTestDocument: async ({ apiHelper, testDocument }, use) => {
		await use(await apiHelper.seedDocument(testDocument));
	},

	withSimpleTestDocument: async ({ apiHelper, testId }, use) => {
		await use(
			await apiHelper.seedDocument(
				createSimpleTestDocument({ title: `Simple ${testId}`, path: `/simple-${testId}` })
			)
		);
	},

	withComplexTestDocument: async ({ apiHelper, testId }, use) => {
		await use(
			await apiHelper.seedDocument(
				createComplexTestDocument({ title: `Complex ${testId}`, path: `/complex-${testId}` })
			)
		);
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

		for (const document of documents) {
			await apiHelper.seedDocument(document);
		}
		await use(documents);
	},

	// One document per fixture: seeding unrelated documents alongside it (as a
	// combined fixture used to) only adds backend writes before the test runs.
	withUnicodeDocument: async ({ apiHelper, testId }, use) => {
		const unicodeDocument = await apiHelper.seedDocument({
			title: `Unicode Test ${testId}`,
			content: `# Unicode Content Test\n\n## Emojis and Symbols\n🚀 🌟 ✅ ❌ 🔥 💡\n\n## Special Characters\nÄÖÜß çñ אב 中文 日本語 한국어\n\n## Math Symbols\n∑ ∂ ∆ π ∞ ≠ ≤ ≥\n\n## Currency\n$ € £ ¥ ₹ ₿`,
			path: `/unicode-${testId}`,
			tags: ['unicode', 'special-chars']
		});
		await use(unicodeDocument);
	},

	withLargeDocument: async ({ apiHelper, testId }, use) => {
		const largeDocument = await apiHelper.seedDocument({
			title: `Large Content ${testId}`,
			content:
				`# Large Content Test\n\n` +
				'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(500) +
				'\n\n## Section 2\n\n' +
				'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(300),
			path: `/large-content-${testId}`,
			tags: ['large', 'performance']
		});
		await use(largeDocument);
	}
});

// Re-export expect
export { expect } from '@playwright/test';

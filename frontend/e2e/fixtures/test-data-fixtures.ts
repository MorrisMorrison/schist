/**
 * Test data fixtures for consistent test data setup
 */

import { test as base } from './test-setup';
import {
	createTestDocument,
	createTestPage,
	createTestFolder,
	createComplexTestDocument,
	createComplexTestPage,
	createSimpleTestDocument,
	createSimpleTestPage,
	createNestedFolders,
	createDocumentsForFolder,
	createPagesForFolder,
	TestDocumentData,
	TestPageData,
	TestFolderData
} from '../utils/test-data';
import { createTestDocuments, createTestPages, createTestFolders } from '../utils/api-helpers';

// Extend test with data fixtures
export const test = base.extend<{
	// Pre-created test data
	testDocument: TestDocumentData;
	testPage: TestPageData;
	simpleTestDocument: TestDocumentData;
	simpleTestPage: TestPageData;
	complexTestDocument: TestDocumentData;
	complexTestPage: TestPageData;
	testFolder: TestFolderData;
	nestedFolders: TestFolderData[];

	// Setup fixtures that create data in the backend
	withTestDocument: TestDocumentData;
	withSimpleTestDocument: TestDocumentData;
	withComplexTestDocument: TestDocumentData;
	withTestPage: TestPageData;
	withSimpleTestPage: TestPageData;
	withTestFolder: TestFolderData;
	withMultipleDocuments: TestDocumentData[];
	withMultiplePages: TestPageData[];
	withNestedStructure: {
		folders: TestFolderData[];
		documents: TestDocumentData[];
		pages: TestPageData[];
	};
	withSearchTestData: {
		textSearchPages: TestPageData[];
		tagSearchPages: TestPageData[];
		combinedSearchPages: TestPageData[];
	};
	withLargeDataset: {
		documents: TestDocumentData[];
		folders: TestFolderData[];
	};
	withCrossLinkedContent: {
		documents: TestDocumentData[];
		linkingDocument: TestDocumentData;
	};
	withSpecialContentTypes: {
		unicodeDocument: TestDocumentData;
		largeDocument: TestDocumentData;
		formattedDocument: TestDocumentData;
		mixedLineEndingDocument: TestDocumentData;
	};
	withNavigationTestData: {
		parentPage: TestPageData;
		childPage: TestPageData;
		grandchildPage: TestPageData;
		searchablePage: TestPageData;
		longPage: TestPageData;
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

	testPage: async ({ testId }, use) => {
		const page = createTestPage({
			title: `Test Page ${testId}`,
			path: `/test-page-${testId}`
		});
		await use(page);
	},

	simpleTestDocument: async ({ testId }, use) => {
		const document = createSimpleTestDocument({
			title: `Simple ${testId}`,
			path: `/simple-${testId}`
		});
		await use(document);
	},

	simpleTestPage: async ({ testId }, use) => {
		const page = createSimpleTestPage({
			title: `Simple ${testId}`,
			path: `/simple-${testId}`
		});
		await use(page);
	},

	complexTestDocument: async ({ testId }, use) => {
		const document = createComplexTestDocument({
			title: `Complex ${testId}`,
			path: `/complex-${testId}`
		});
		await use(document);
	},

	complexTestPage: async ({ testId }, use) => {
		const page = createComplexTestPage({
			title: `Complex ${testId}`,
			path: `/complex-${testId}`
		});
		await use(page);
	},

	testFolder: async ({ testId }, use) => {
		const folder = createTestFolder({
			name: `test-folder-${testId}`,
			path: `/test-folder-${testId}`
		});
		await use(folder);
	},

	nestedFolders: async ({ testId }, use) => {
		const folders = createNestedFolders(3).map((folder) => ({
			...folder,
			name: `${folder.name}-${testId}`,
			path: `${folder.path}-${testId}`
		}));
		await use(folders);
	},

	// Data fixtures that actually create content in the backend
	withTestDocument: async ({ apiHelper, testDocument }, use) => {
		// Create the document in the backend
		const result = await apiHelper.createDocument(testDocument);
		if (result.status !== 201) {
			throw new Error(`Failed to create test document: ${result.error}`);
		}

		await use(testDocument);

		// Cleanup is handled by apiHelper fixture
	},

	withSimpleTestDocument: async ({ apiHelper, simpleTestDocument }, use) => {
		// Create the simple document in the backend
		const result = await apiHelper.createDocument(simpleTestDocument);
		if (result.status !== 201) {
			throw new Error(`Failed to create simple test document: ${result.error}`);
		}

		await use(simpleTestDocument);

		// Cleanup is handled by apiHelper fixture
	},

	withComplexTestDocument: async ({ apiHelper, complexTestDocument }, use) => {
		// Create the complex document in the backend
		const result = await apiHelper.createDocument(complexTestDocument);
		if (result.status !== 201) {
			throw new Error(`Failed to create complex test document: ${result.error}`);
		}

		await use(complexTestDocument);

		// Cleanup is handled by apiHelper fixture
	},

	withTestPage: async ({ apiHelper, testPage }, use) => {
		// Create the page in the backend
		const result = await apiHelper.createPage(testPage);
		if (result.status !== 201) {
			throw new Error(`Failed to create test page: ${result.error}`);
		}

		await use(testPage);

		// Cleanup is handled by apiHelper fixture
	},

	withSimpleTestPage: async ({ apiHelper, simpleTestPage }, use) => {
		// Create the simple page in the backend
		const result = await apiHelper.createPage(simpleTestPage);
		if (result.status !== 201) {
			throw new Error(`Failed to create simple test page: ${result.error}`);
		}

		await use(simpleTestPage);

		// Cleanup is handled by apiHelper fixture
	},

	withTestFolder: async ({ apiHelper, testFolder }, use) => {
		// Create the folder in the backend
		const result = await apiHelper.createFolder(testFolder);
		if (result.status !== 201) {
			throw new Error(`Failed to create test folder: ${result.error}`);
		}

		await use(testFolder);

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

	withMultiplePages: async ({ apiHelper, testId }, use) => {
		// Create multiple test pages
		const pages = [
			createSimpleTestPage({
				title: `Page 1 ${testId}`,
				path: `/page-1-${testId}`,
				tags: ['test', 'page1']
			}),
			createTestPage({
				title: `Page 2 ${testId}`,
				path: `/page-2-${testId}`,
				tags: ['test', 'page2']
			}),
			createComplexTestPage({
				title: `Page 3 ${testId}`,
				path: `/page-3-${testId}`,
				tags: ['test', 'page3', 'complex']
			})
		];

		await createTestPages(apiHelper, pages);
		await use(pages);

		// Cleanup is handled by apiHelper fixture
	},

	withNestedStructure: async ({ apiHelper, testId }, use) => {
		// Create nested folder structure with documents
		const folders = createNestedFolders(2).map((folder) => ({
			...folder,
			name: `${folder.name}-${testId}`,
			path: `${folder.path}-${testId}`
		}));

		// Create folders first
		await createTestFolders(apiHelper, folders);

		// Create documents in each folder
		const allDocuments: TestDocumentData[] = [];
		const allPages: TestPageData[] = [];
		for (const folder of folders) {
			const folderDocuments = createDocumentsForFolder(folder.path, 2).map((document) => ({
				...document,
				title: `${document.title} ${testId}`,
				path: `${document.path}-${testId}`
			}));
			const folderPages = createPagesForFolder(folder.path, 2).map((page) => ({
				...page,
				title: `${page.title} ${testId}`,
				path: `${page.path}-${testId}`
			}));
			allDocuments.push(...folderDocuments);
			allPages.push(...folderPages);
		}

		await createTestDocuments(apiHelper, allDocuments);
		await createTestPages(apiHelper, allPages);

		await use({ folders, documents: allDocuments, pages: allPages });

		// Cleanup is handled by apiHelper fixture
	},

	withSearchTestData: async ({ apiHelper, testId }, use) => {
		// Create comprehensive search test data
		const textSearchPages = [
			createTestPage({
				title: `Searchable Content ${testId}`,
				content:
					'# Searchable Title\n\nThis page contains unique searchable text that should be found.',
				path: `/searchable-${testId}`,
				tags: ['search', 'test']
			}),
			createTestPage({
				title: `Different Title ${testId}`,
				content: '# Different Content\n\nThis page has different content without special terms.',
				path: `/different-${testId}`,
				tags: ['content', 'test']
			}),
			createTestPage({
				title: `Nested Searchable ${testId}`,
				content: '# Nested Content\n\nThis nested page contains searchable text in a folder.',
				path: `/folder/nested-searchable-${testId}`,
				tags: ['search', 'nested']
			})
		];

		const tagSearchPages = [
			createTestPage({
				title: `Important Document ${testId}`,
				content: '# Important Documentation\n\nThis is tagged as important.',
				path: `/important-${testId}`,
				tags: ['important', 'documentation', 'priority']
			}),
			createTestPage({
				title: `Draft Content ${testId}`,
				content: '# Draft Content\n\nThis is a draft document.',
				path: `/draft-${testId}`,
				tags: ['draft', 'review', 'wip']
			}),
			createTestPage({
				title: `Project Alpha ${testId}`,
				content: '# Project Alpha\n\nDocumentation for project alpha.',
				path: `/project-alpha-${testId}`,
				tags: ['project-alpha', 'documentation']
			}),
			createTestPage({
				title: `Project Beta ${testId}`,
				content: '# Project Beta\n\nDocumentation for project beta.',
				path: `/project-beta-${testId}`,
				tags: ['project-beta', 'documentation']
			})
		];

		const combinedSearchPages = [
			createTestPage({
				title: `Important Project ${testId}`,
				content:
					'# Important Project Documentation\n\nThis combines important content with project tags.',
				path: `/important-project-${testId}`,
				tags: ['important', 'project', 'documentation']
			}),
			createTestPage({
				title: `Regular Content ${testId}`,
				content: '# Regular Content\n\nThis has project tags but no important text.',
				path: `/regular-${testId}`,
				tags: ['project', 'content']
			}),
			createTestPage({
				title: `Important Notes ${testId}`,
				content: '# Important Meeting Notes\n\nImportant content without project tags.',
				path: `/notes-${testId}`,
				tags: ['notes', 'meeting']
			})
		];

		const allPages = [...textSearchPages, ...tagSearchPages, ...combinedSearchPages];
		await createTestPages(apiHelper, allPages);

		await use({
			textSearchPages,
			tagSearchPages,
			combinedSearchPages
		});
	},

	withLargeDataset: async ({ apiHelper, testId }, use) => {
		// Create a large dataset for performance testing
		const folders = Array.from({ length: 5 }, (_, i) =>
			createTestFolder({
				name: `large-folder-${i}-${testId}`,
				path: `/large-folder-${i}-${testId}`
			})
		);

		const documents = Array.from({ length: 20 }, (_, i) => {
			const folderIndex = i % folders.length;
			const folder = folders[folderIndex];
			return createTestDocument({
				title: `Large Dataset Doc ${i} ${testId}`,
				content: `# Document ${i}\n\nThis is document number ${i} in the large dataset.\n\n## Content\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\n### Section ${i}\n\nUt enim ad minim veniam, quis nostrud exercitation ullamco laboris.`,
				path: `${folder.path}/doc-${i}-${testId}`,
				tags: [`batch-${Math.floor(i / 5)}`, 'large-dataset', `doc-${i}`]
			});
		});

		await createTestFolders(apiHelper, folders);
		await createTestDocuments(apiHelper, documents);

		await use({ documents, folders });
	},

	withCrossLinkedContent: async ({ apiHelper, testId }, use) => {
		// Create documents that link to each other
		const documents = [
			createTestDocument({
				title: `Main Document ${testId}`,
				content: `# Main Document\n\nThis is the main document that references:\n\n- [Secondary Document](secondary-${testId})\n- [Reference Document](reference-${testId})\n\n## Content\n\nSee related information in the linked documents.`,
				path: `/main-${testId}`,
				tags: ['main', 'hub', 'links']
			}),
			createTestDocument({
				title: `Secondary Document ${testId}`,
				content: `# Secondary Document\n\nThis document is referenced by [Main Document](main-${testId}).\n\n## Back Reference\n\nIt also mentions [Reference Document](reference-${testId}).`,
				path: `/secondary-${testId}`,
				tags: ['secondary', 'linked']
			}),
			createTestDocument({
				title: `Reference Document ${testId}`,
				content: `# Reference Document\n\nThis is referenced by both:\n- [Main Document](main-${testId})\n- [Secondary Document](secondary-${testId})\n\n## Standalone Content\n\nThis document contains reference information.`,
				path: `/reference-${testId}`,
				tags: ['reference', 'shared']
			})
		];

		const linkingDocument = createTestDocument({
			title: `Hub Document ${testId}`,
			content: `# Hub Document\n\nThis document links to all others:\n\n## Primary Links\n- [Main Document](main-${testId})\n- [Secondary Document](secondary-${testId})\n- [Reference Document](reference-${testId})\n\n## Summary\n\nAll documents are interconnected through wiki-style links.`,
			path: `/hub-${testId}`,
			tags: ['hub', 'central', 'all-links']
		});

		const allDocuments = [...documents, linkingDocument];
		await createTestDocuments(apiHelper, allDocuments);

		await use({ documents, linkingDocument });
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
	},

	withNavigationTestData: async ({ apiHelper, testId }, use) => {
		// Create hierarchical navigation test data
		const parentPage = createTestPage({
			title: `Parent Page ${testId}`,
			content: `# Parent Page\n\nThis is the parent page for navigation testing.\n\n[Child Page](child-${testId})\n[Grandchild Page](nested/grandchild-${testId})`,
			path: `/parent-${testId}`,
			tags: ['navigation', 'parent']
		});

		const childPage = createTestPage({
			title: `Child Page ${testId}`,
			content: `# Child Page\n\nThis is a child page.\n\nParent: [Parent Page](parent-${testId})\nChild: [Grandchild Page](nested/grandchild-${testId})`,
			path: `/child-${testId}`,
			tags: ['navigation', 'child']
		});

		const grandchildPage = createTestPage({
			title: `Grandchild Page ${testId}`,
			content: `# Grandchild Page\n\nDeep nested page for navigation testing.\n\nParent: [Parent Page](../parent-${testId})\nParent: [Child Page](../child-${testId})`,
			path: `/nested/grandchild-${testId}`,
			tags: ['navigation', 'nested']
		});

		const searchablePage = createTestPage({
			title: `Searchable Navigation ${testId}`,
			content: `# Searchable Page\n\nThis page should be found in navigation search results.\n\nKeywords: navigation, search, findable`,
			path: `/searchable-nav-${testId}`,
			tags: ['searchable', 'navigation']
		});

		const longContent =
			`# Long Content Page\n\n` +
			Array.from(
				{ length: 50 },
				(_, i) =>
					`## Section ${i + 1}\n\nThis is section ${i + 1} with content that makes the page long enough to test scroll behavior.\n\n`
			).join('');

		const longPage = createTestPage({
			title: `Long Page ${testId}`,
			content: longContent,
			path: `/long-page-${testId}`,
			tags: ['long', 'scroll']
		});

		const pages = [parentPage, childPage, grandchildPage, searchablePage, longPage];
		await createTestPages(apiHelper, pages);

		await use({
			parentPage,
			childPage,
			grandchildPage,
			searchablePage,
			longPage
		});
	}
});

// Re-export expect
export { expect } from '@playwright/test';

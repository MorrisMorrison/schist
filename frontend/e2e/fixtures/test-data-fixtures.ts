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
	withTestPage: TestPageData;
	withTestFolder: TestFolderData;
	withMultipleDocuments: TestDocumentData[];
	withMultiplePages: TestPageData[];
	withNestedStructure: {
		folders: TestFolderData[];
		documents: TestDocumentData[];
		pages: TestPageData[];
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

	withTestPage: async ({ apiHelper, testPage }, use) => {
		// Create the page in the backend
		const result = await apiHelper.createPage(testPage);
		if (result.status !== 201) {
			throw new Error(`Failed to create test page: ${result.error}`);
		}

		await use(testPage);

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
	}
});

// Re-export expect
export { expect } from '@playwright/test';

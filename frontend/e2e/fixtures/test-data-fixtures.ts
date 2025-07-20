/**
 * Test data fixtures for consistent test data setup
 */

import { test as base } from './test-setup';
import {
	createTestPage,
	createTestFolder,
	createComplexTestPage,
	createSimpleTestPage,
	createNestedFolders,
	createPagesForFolder,
	TestPageData,
	TestFolderData
} from '../utils/test-data';
import { ApiHelper, createTestPages, createTestFolders } from '../utils/api-helpers';

// Extend test with data fixtures
export const test = base.extend<{
	// Pre-created test data
	testPage: TestPageData;
	simpleTestPage: TestPageData;
	complexTestPage: TestPageData;
	testFolder: TestFolderData;
	nestedFolders: TestFolderData[];

	// Setup fixtures that create data in the backend
	withTestPage: TestPageData;
	withTestFolder: TestFolderData;
	withMultiplePages: TestPageData[];
	withNestedStructure: { folders: TestFolderData[]; pages: TestPageData[] };
}>({
	// Basic test data (not created in backend)
	testPage: async ({ testId }, use) => {
		const page = createTestPage({
			title: `Test Page ${testId}`,
			path: `/test-page-${testId}`
		});
		await use(page);
	},

	simpleTestPage: async ({ testId }, use) => {
		const page = createSimpleTestPage({
			title: `Simple ${testId}`,
			path: `/simple-${testId}`
		});
		await use(page);
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
		const folders = createNestedFolders(3).map((folder, index) => ({
			...folder,
			name: `${folder.name}-${testId}`,
			path: `${folder.path}-${testId}`
		}));
		await use(folders);
	},

	// Data fixtures that actually create content in the backend
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
		// Create nested folder structure with pages
		const folders = createNestedFolders(2).map((folder) => ({
			...folder,
			name: `${folder.name}-${testId}`,
			path: `${folder.path}-${testId}`
		}));

		// Create folders first
		await createTestFolders(apiHelper, folders);

		// Create pages in each folder
		const allPages: TestPageData[] = [];
		for (const folder of folders) {
			const folderPages = createPagesForFolder(folder.path, 2).map((page) => ({
				...page,
				title: `${page.title} ${testId}`,
				path: `${page.path}-${testId}`
			}));
			allPages.push(...folderPages);
		}

		await createTestPages(apiHelper, allPages);

		await use({ folders, pages: allPages });

		// Cleanup is handled by apiHelper fixture
	}
});

// Re-export expect
export { expect } from '@playwright/test';

/**
 * Test setup fixtures for e2e tests
 */

import { test as base, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { EditorPage } from '../pages/EditorPage';
import { PageViewPage } from '../pages/PageViewPage';
import { FolderPage } from '../pages/FolderPage';
import { ApiHelper } from '../utils/api-helpers';
import { generateTestId } from '../utils/test-data';

// Extend base test with our fixtures
export const test = base.extend<{
	homePage: HomePage;
	editorPage: EditorPage;
	pageViewPage: PageViewPage;
	folderPage: FolderPage;
	apiHelper: ApiHelper;
	testId: string;
}>({
	// Page object fixtures
	homePage: async ({ page }, use) => {
		const homePage = new HomePage(page);
		await use(homePage);
	},

	editorPage: async ({ page }, use) => {
		const editorPage = new EditorPage(page);
		await use(editorPage);
	},

	pageViewPage: async ({ page }, use) => {
		const pageViewPage = new PageViewPage(page);
		await use(pageViewPage);
	},

	folderPage: async ({ page }, use) => {
		const folderPage = new FolderPage(page);
		await use(folderPage);
	},

	// API helper fixture
	apiHelper: async ({ request }, use) => {
		const apiHelper = new ApiHelper(request);

		// Wait for API to be ready before running tests
		const isReady = await apiHelper.waitForApiReady();
		expect(isReady).toBe(true);

		await use(apiHelper);

		// Cleanup after test
		await apiHelper.cleanupTestData();
	},

	// Test ID fixture for unique identifiers
	// eslint-disable-next-line no-empty-pattern
	testId: async ({}, use) => {
		const testId = generateTestId();
		await use(testId);
	}
});

// Export expect from Playwright
export { expect } from '@playwright/test';

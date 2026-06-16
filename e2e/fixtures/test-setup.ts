/**
 * Test setup fixtures for e2e tests
 * Only essential cleanup - removes complex DirectoryManager logic
 */

/// <reference types="node" />

import { test as base } from '@playwright/test';
import { readFileSync } from 'fs';
import { HomePage } from '../pages/HomePage';
import { EditorPage } from '../pages/EditorPage';
import { DocumentViewPage } from '../pages/DocumentViewPage';
import { FolderPage } from '../pages/FolderPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ApiHelper } from '../utils/api-helpers';
import { generateTestId } from '../utils/test-data';

const DEFAULT_NAVIGATION_TIMEOUT_MILLIS = 10000;
const SERVICE_URL = process.env?.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export const test = base.extend<{
	homePage: HomePage;
	editorPage: EditorPage;
	documentViewPage: DocumentViewPage;
	folderPage: FolderPage;
	settingsPage: SettingsPage;
	apiHelper: ApiHelper;
	testId: string;
}>({
	homePage: async ({ page }, use) => {
		page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MILLIS);
		await page.goto(SERVICE_URL);
		const homePage = new HomePage(page);
		await use(homePage);
	},

	editorPage: async ({ page }, use) => {
		await page.goto(SERVICE_URL);
		const editorPage = new EditorPage(page);
		await use(editorPage);
	},

	documentViewPage: async ({ page }, use) => {
		await page.goto(SERVICE_URL);
		const documentViewPage = new DocumentViewPage(page);
		await use(documentViewPage);
	},

	folderPage: async ({ page }, use) => {
		await page.goto(SERVICE_URL);
		const folderPage = new FolderPage(page);
		await use(folderPage);
	},

	settingsPage: async ({ page }, use) => {
		await page.goto(SERVICE_URL);
		const settingsPage = new SettingsPage(page);
		await use(settingsPage);
	},

	apiHelper: async ({ request }, use, testInfo) => {
		const projectName = testInfo.project.name;

		const apiHelper = new ApiHelper(request, `${SERVICE_URL}/api`);

		// Load auth token for authenticated projects (not setup)
		if (projectName === 'e2e') {
			try {
				const authData = JSON.parse(readFileSync('playwright/.auth/user.json', 'utf8'));
				const token = authData.origins?.[0]?.localStorage?.find(
					(item: { name: string; value: string }) => item.name === 'schist_auth_token'
				)?.value;
				if (token) {
					apiHelper.setAuthToken(token);
				}
			} catch (error) {
				console.warn('Failed to load auth token for API helper:', error);
			}
		}

		await use(apiHelper);

		try {
			await apiHelper.cleanupTestData();
		} catch (error) {
			console.warn(`[ApiHelper] Cleanup failed for project ${projectName}:`, error);
		}
	},

	// eslint-disable-next-line no-empty-pattern
	testId: async ({}, use) => {
		const testId = generateTestId();
		await use(testId);
	}
});

export { expect } from '@playwright/test';

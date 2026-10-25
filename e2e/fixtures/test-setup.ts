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
import { SharedDocumentPage } from '../pages/SharedDocumentPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ApiHelper } from '../utils/api-helpers';
import { BASE_URL } from '../utils/routes';
import { generateTestId } from '../utils/test-data';

const DEFAULT_NAVIGATION_TIMEOUT_MILLIS = 10000;

export const test = base.extend<{
	homePage: HomePage;
	editorPage: EditorPage;
	documentViewPage: DocumentViewPage;
	folderPage: FolderPage;
	settingsPage: SettingsPage;
	sharedDocumentPage: SharedDocumentPage;
	apiHelper: ApiHelper;
	testId: string;
	_autoCleanup: void;
	_browserDiagnostics: void;
}>({
	homePage: async ({ page }, use) => {
		page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MILLIS);
		await page.goto(BASE_URL);
		const homePage = new HomePage(page);
		await use(homePage);
	},

	editorPage: async ({ page }, use) => {
		await page.goto(BASE_URL);
		const editorPage = new EditorPage(page);
		await use(editorPage);
	},

	documentViewPage: async ({ page }, use) => {
		await page.goto(BASE_URL);
		const documentViewPage = new DocumentViewPage(page);
		await use(documentViewPage);
	},

	folderPage: async ({ page }, use) => {
		await page.goto(BASE_URL);
		const folderPage = new FolderPage(page);
		await use(folderPage);
	},

	settingsPage: async ({ page }, use) => {
		await page.goto(BASE_URL);
		const settingsPage = new SettingsPage(page);
		await use(settingsPage);
	},

	// The public share page: no warm-up visit to the app, the test navigates to
	// a share link itself.
	sharedDocumentPage: async ({ page }, use) => {
		await use(new SharedDocumentPage(page));
	},

	apiHelper: async ({ request }, use, testInfo) => {
		const projectName = testInfo.project.name;

		const apiHelper = new ApiHelper(request, `${BASE_URL}/api`);

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

	// Every test gets the backend wiped after it, whether or not it asked for
	// `apiHelper`. Without this, tests that only drive the UI (e.g. creating a
	// document through the editor) leaked their data into the shared backend for
	// later tests -- and into their own retry, where a leftover title trips the
	// duplicate-name guard. Cleanup deletes *everything*, which is only safe
	// because the suite runs with workers: 1 (see playwright.config.ts).
	_autoCleanup: [
		async ({ apiHelper }, use) => {
			// Depending on apiHelper is what schedules its cleanup teardown.
			void apiHelper;
			await use();
		},
		{ auto: true }
	],

	// On failure, attach the browser's console errors, uncaught page errors and
	// failed API responses. The chronic flakes are "the route never rendered"
	// (element(s) not found for the whole page), which a screenshot alone cannot
	// explain.
	_browserDiagnostics: [
		async ({ page }, use, testInfo) => {
			const lines: string[] = [];
			const stamp = () => new Date().toISOString();
			page.on('console', (message) => {
				if (message.type() === 'error' || message.type() === 'warning') {
					lines.push(`${stamp()} console.${message.type()}: ${message.text()}`);
				}
			});
			page.on('pageerror', (error) => lines.push(`${stamp()} pageerror: ${error.message}`));
			page.on('requestfailed', (request) => {
				lines.push(
					`${stamp()} requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText})`
				);
			});
			page.on('response', (response) => {
				if (response.status() >= 400 && response.url().includes('/api/')) {
					lines.push(
						`${stamp()} response ${response.status()}: ${response.request().method()} ${response.url()}`
					);
				}
			});

			await use();

			if (testInfo.status !== testInfo.expectedStatus && lines.length > 0) {
				await testInfo.attach('browser-diagnostics', {
					body: lines.join('\n'),
					contentType: 'text/plain'
				});
			}
		},
		{ auto: true }
	],

	// eslint-disable-next-line no-empty-pattern
	testId: async ({}, use) => {
		const testId = generateTestId();
		await use(testId);
	}
});

export { expect } from '@playwright/test';
